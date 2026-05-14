# Nhật Ký Tiến Độ Checklist Endpoint Marketplace

# 2026-05-14 - Repair order_items thiếu và gom route Worker theo feature

## Việc đã làm

- Thêm endpoint `GET/POST /api/orders/backfill-missing-items` cho Shopee: đọc `orders_v2` đang thiếu `order_items`, gọi Shopee `/api/v2/order/get_order_detail` theo danh sách `order_id`, chỉ import detail có `item_list`.
- Endpoint repair dùng lại `fetchShopeeOrderDetails()`, `buildShopeeImportPayload()` và luồng `importOrdersV2`; đặt `suppress_push=true`, `skip_inventory=true` để không đẩy realtime hoặc trừ kho cho đơn lịch sử.
- Gom route Worker root vào folder theo feature và giữ wrapper mỏng để public API/import cũ không đổi; bản đồ nằm ở `docs/refactor-file-map.md`.
- Ghi báo cáo cleanup dữ liệu tại `docs/data-cleanup-report.md`.

## Trạng thái vận hành

- Shop có API: Shopee có thể backfill item thiếu bằng endpoint repair riêng, không phụ thuộc `get_order_list` theo `update_time`.
- Shop không API: không đổi luồng; không insert placeholder và không gắn nhãn đồng bộ API.
- An toàn dữ liệu: không xóa `orders_v2`, không xóa `order_items` hợp lệ, không xóa đơn có revenue.

## Đã deploy và kiểm production thật

- Worker production đã deploy version `8fa2cd50-0ccc-4ee7-ab06-734fee038596`.
- Production `GET /api/orders/backfill-missing-items?platform=shopee&shop=chihuy1984&limit=50` trả `status=ok`, `missing_before=47`, `fetched_details=47`, `details_with_items=47`, `imported_orders=47`, `imported_items=61`, `missing_after=0`.
- Gọi lại endpoint repair cùng tham số trả `missing_before=0`, `selected_orders=0`, `missing_after=0`.
- D1 remote sau backfill chỉ còn nhóm thiếu item của `chihuy1984` có `revenue=0`: `CANCELLED/CANCELLED` 13 đơn và `COMPLETED/COMPLETED` 3 đơn.
- Route cũ `/api/orders/sync-api-orders` vẫn hoạt động khi smoke test giới hạn `platform=shopee&shop=chihuy1984&limit=1&fetch_fees=0&fetch_tracking=0`, trả `status=ok`, `fetched=1`, `imported_orders=1`, `imported_items=1`.

# 2026-05-14 - Sửa doanh thu báo cáo, đơn hoàn âm tiền, SKU và quét đóng gói

## Việc đã làm

- Thêm core `order-return-inference-core` cho đơn Shopee doanh thu import bằng `0` nhưng có giá trị gốc/đã hoàn toàn phần: chỉ giữ phí hoàn/trả `1.620đ`, không giữ vốn và không phân bổ ADS khi chưa có Payment/Escrow thật.
- Rebuild production Shopee tháng 04 cho `order_analytics`, sửa top SKU/đơn âm tiền để không nhân toàn bộ lỗ vào từng SKU khi thiếu tỷ lệ doanh thu dòng.
- Sửa `/api/report-summary` và KPI Dashboard: tab `Theo Báo Cáo Sàn` dùng doanh thu ròng sau hoàn/hủy, hiện doanh thu gốc, hoàn/hủy đã trừ, chênh lệch import và chi tiết theo shop.
- Lọc shop sinh tự động dạng `Shopee <id>` khi đã có shop canonical như `phambich2312`; callback Shopee ưu tiên shop tên thật.
- Cron API sync đổi sang quét tất cả shop API theo batch nhẹ cho đơn/trạng thái thay vì xoay vòng một shop duy nhất.
- Trang SKU thêm nút `Tạo sản phẩm`; lưu SKU/product metadata không gửi stock khi kho bị khóa bởi ShipXanh; `Copy NB` tìm SKU nội bộ exact trước khi tạo mới.
- Preview shop/API đổi nhãn bị chặn/preview rõ bằng tiếng Việt; trạm quét đóng gói không phát âm mã đơn/mã vận đơn, chỉ dùng mã để tra cứu và log.
- Thêm guard `scripts/check-code-size.mjs`, workflow `.github/workflows/code-size-guard.yml`, và xuất tree KB tại `artifacts/project-tree-kb-2026-05-14.txt`.

## Trạng thái vận hành

- Shop có API: Shopee API shops được cron quét đơn/trạng thái theo batch nhẹ; doanh thu báo cáo đọc dữ liệu report net và order analytics đọc core tài chính đã chuẩn hóa.
- Shop không API: không đổi luồng, vẫn import/browser có kiểm soát; UI không gắn nhãn đồng bộ API cho shop chưa có API.
- Shopee tháng 04: các đơn suy luận hoàn/trả toàn phần đang tính theo phí còn lại, không dùng fallback giá vốn/ADS.

## Kiểm tra

- `node --check` pass cho `19` file JS/MJS đã chạm.
- Import smoke pass: `buildZeroRevenueReturnFinance()` trả `amount=-1620`; `buildPublicShopRows()` chỉ giữ `phambich2312`, không giữ `Shopee 166563639`.
- Worker production đã deploy version `6e3e7a8b-0c88-4d4d-8622-ba0fc8783e30`; frontend/static production đã deploy version `c752d883-65d3-46ee-a8ee-29b71ee198f2`.
- Production `/api/shops` hiện chỉ còn `6` shop thật, không còn shop `Shopee 166563639`.
- Production `/api/report-summary?from=2026-04-01&to=2026-04-30` trả `gross=190.788.888đ`, `net=185.135.857đ`, `refund=5.509.000đ`, `6` shop.
- Production D1 `order_analytics` đã kiểm `260411HCTWXDA7`: `actual_income=-1620`, `platform_fees=1620`, `cost_of_goods=0`, `ads_cost_allocated=0`, `net_profit=-1620`, `actual_income_source=orders_v2_zero_revenue_return_fee`.
- Chrome profile `ProductionAdminTest` đã mở Dashboard thật tháng 04: tab báo cáo hiện `DT báo cáo ròng`, `Hoàn/hủy đã trừ` và chi tiết theo shop gồm `phambich2312`; SKU page có `Tạo sản phẩm`; product-detail tạo mới mở được; admin-products đã load `copy-internal-sku.js`; CCTV packing không đọc mã trong câu phát âm.
- Guard 30KB đã chạy và đang chặn đúng các file legacy còn quá ngưỡng; cần split tiếp trước khi CI xanh toàn bộ.

# 2026-05-13 - Sửa lãi ròng Shopee Payment/Escrow và làm rõ UI Khuyến mãi sàn

## Việc đã làm

- Tách cụm `order-analytics` theo core tự trị để giữ file dưới 30KB:
  - `apps/worker-api/src/routes/order-analytics.js` chỉ còn wrapper route.
  - `apps/worker-api/src/routes/order-analytics/order-analytics-rebuild-core.js` giữ luồng rebuild/sync.
  - `apps/worker-api/src/core/order-analytics-shared-core.js` và `apps/worker-api/src/core/order-analytics-finance-core.js` gom helper dùng chung.
- Sửa adapter Shopee Payment/Escrow để giữ đúng dấu âm/dương của `escrow_amount` khi lưu `order_fee_details.settlement`; đơn trả hàng/hoàn tiền không còn bị đổi thành số dương.
- Mở sync escrow detail ngay trong rebuild `Lãi ròng API`: khi bấm `Đồng bộ Payment + tính lại`, Worker kéo thêm `get_escrow_detail` cho Shopee và lưu lại `order_fee_details`.
- Sửa core tài chính đơn:
  - nếu Shopee Payment/Escrow đã trừ hoàn tiền thì không trừ hoàn lần hai;
  - nếu là hoàn toàn bộ thì nhả `cost_of_goods=0`, không trừ vốn lần hai;
  - nếu ledger return còn thiếu nhưng raw Payment đã có hoàn tiền thì gắn `return_status=RETURN_REFUND`.
- Sửa UI `Lãi ròng API`:
  - nhãn trạng thái `RETURN_REFUND` hiển thị `Trả hàng / hoàn tiền`;
  - đơn âm có chip giải thích `Payment API đã trừ hoàn tiền` và `Không trừ vốn lần hai`;
  - trạng thái bảng và CSV ưu tiên `return_status` trước `shipping_status/oms_status`.
- Làm rõ UI `Khuyến mãi sàn`:
  - tên module và action hàng đợi đổi sang tiếng Việt đúng nghiệp vụ;
  - tab `Danh sách` có `Xóa cache` và nút trạng thái sàn theo từng dòng;
  - tab `Chi tiết / giá` có empty state rõ ràng, không còn panel trắng;
  - các module khóa ghi thật dùng nút `Xem trạng thái endpoint` thay vì nút mơ hồ.
- Sửa core ADS overlap trong `promotion_tool_core`: campaign có SKU rỗng không còn bị join vào mọi SKU khuyến mãi; phần spend chưa map SKU được tách riêng thành `unmatched_campaigns/unmatched_spend`.
- Thêm route xóa cache read-only:
  - `POST /api/discounts/promotion-cache/delete`
  - chỉ xóa D1 nội bộ, không gửi lệnh xóa lên sàn.

## Trạng thái vận hành

- Shop Shopee có Payment API:
  - `actual_income` ưu tiên `get_income_detail`, thiếu thì lấy `get_escrow_detail`;
  - đơn hoàn toàn bộ đọc đúng `escrow_amount` âm, không trừ vốn lần hai, không nhân đôi hoàn tiền.
- Shop không có API: không đổi luồng; vẫn chỉ dùng dữ liệu tham chiếu/import/browser có kiểm soát và không gắn nhãn Payment API.
- `Khuyến mãi sàn` vẫn là read-only cho Voucher/Bundle/Add-On/Flash/Freeship/Flexicombo/Early Bird; Shopee Discount tiếp tục là module duy nhất có guard ghi thật.

## Kiểm tra

- `node --check` pass cho toàn bộ file đã đụng ở Worker/API/FE của `order-analytics`, Shopee escrow, `promotion_tool_core` và ADS promotion UI.
- Worker production đã deploy version `be93c0f5-92ef-46b8-b57f-75e3ca921021`.
- Frontend/static production đã deploy version `4f1bbcfe-06d3-4032-8fdc-f5e4f7d71e54`.
- Production API `GET /api/order-analytics?from=2026-05-12&to=2026-05-13&platform=shopee&shop=chihuy1984&limit=120&rebuild=1&sync_payment=1` trả:
  - `2605127JX9N4N6`: `actual_income=-1620`, `platform_fees=1620`, `cost_of_goods=0`, `refund_deduction=450000`, `return_status=RETURN_REFUND`, `net_profit=-1620`.
  - `260513A4HT5Q1Y`: `actual_income=62175`, `actual_income_source=shopee.payment.get_escrow_detail`, `platform_fees=16825`, `cost_of_goods=28500`, `net_profit=33675`.
- Production D1 `order_fee_details` đã lưu đúng dấu settlement:
  - `2605127JX9N4N6`: `settlement=-1620`, `total_fees=1620`.
  - `260513A4HT5Q1Y`: `settlement=62175`, `total_fees=16825`.
- Chrome profile `ProductionAdminTest` trên production:
  - tab `Lãi ròng API` hiển thị trực tiếp dòng `260513A4HT5Q1Y` với `Escrow API`, `62.175đ` thực nhận và `33.675đ` lãi ròng;
  - tab `Khuyến mãi sàn > Tính năng` hiện đủ `9` card;
  - tab `Khuyến mãi sàn > Danh sách` hiện các dòng chương trình với nút `Mở chi tiết`, nút trạng thái và `Xóa cache`;
  - tab `Khuyến mãi sàn > Chi tiết / giá` hiển thị empty state tiếng Việt, không còn trắng;
  - tab `Khuyến mãi sàn > Hàng đợi duyệt` hiển thị `Mua kèm deal · Quy tắc giá theo tồn kho`, không còn raw `bundle_deal` / `stock_price_rule`;
  - tab `Khuyến mãi sàn > Tổng quan core` hiển thị note `campaign ADS chưa map được SKU` và các dòng rủi ro đầu tiên đều `ADS 0đ`, không còn bị dàn một số spend lớn giống nhau cho mọi SKU.
- Mobile production 390px tại `ads.html`:
  - `viewport=390`, `bodyWidth=390`, `overflow=false`;
  - khu `Khuyến mãi sàn > Tính năng` vẫn hiện đủ `9` card, không tràn ngang.

# 2026-05-13 - Tách core tự trị ADS, promotion và api-sync dưới 30KB

## Việc đã làm

- Tách `apps/worker-api/src/routes/api-sync.js` thành wrapper nhỏ và các module theo nhóm `common`, `shopee`, `lazada`, `ads`, `finance`, `orders`, `products`, `returns`.
- Tách `apps/worker-api/src/routes/discounts.js` thành wrapper nhỏ và các module theo nhóm `common`, `shopee/discounts`, `shopee/vouchers`, `shopee/promotions`, `lazada/vouchers`, `lazada/promotions`.
- Tách `apps/fe/js/dashboard/ads.js` thành loader nhỏ và các file con trong `apps/fe/js/dashboard/ads/`; trang ADS vẫn nạp theo đúng thứ tự để giữ hành vi cũ.
- Tách CSS/script inline của `apps/fe/pages/ads.html` ra `apps/fe/css/ads-page.css` và `apps/fe/js/dashboard/ads/ads-page-controls.js`; `ads.html` đã dưới 30KB.
- Xuất cấu trúc file và dung lượng tại `artifacts/ads-api-sync-core-file-structure-20260513.txt`.

## Trạng thái vận hành

- Shopee/Lazada/TikTok không đổi endpoint và không tạo dữ liệu giả; các route hiện tại vẫn đi qua wrapper cũ để giữ contract import.
- Shop có API: ADS/promotion/read-only sync tiếp tục đọc Open Platform qua core đã tách; Shopee Discount ghi thật vẫn chỉ qua guard/admin như trước.
- Shop không API: vẫn chỉ dùng dữ liệu tham chiếu/import/browser có kiểm soát; không gắn nhãn đồng bộ API cho shop chưa có API.
- Các file mới trong cụm đã xử lý đều dưới 30KB; một số file legacy ngoài cụm ADS/promotion/api-sync vẫn cần tách ở các đợt riêng để đạt chuẩn toàn hệ thống.

## Kiểm tra

- `node --check` pass cho wrapper và toàn bộ module mới của `api-sync`, `discounts`, ADS frontend.
- Import ESM trực tiếp pass: `api-sync.js` xuất 67 symbol, `discounts.js` xuất 20 symbol.
- Worker dry-run pass, deploy production version `819744c3-0b4a-47fa-8758-baf7bcccf2e1`.
- Frontend/static dry-run pass, deploy production version `d84c66ad-5db2-4b01-9ce4-97450a6bc025`.
- Production API đọc an toàn `GET /api/discounts/promotion-tool-core?limit=1` trên Worker trả `status=ok`, `mode=promotion_tool_core`, endpoint summary `done=8`, `locked=8`.
- Production API đọc an toàn `GET /api/ads?from=2026-05-01&to=2026-05-13&limit=1` trả `status=ok`.
- Production `ads.html` trả HTTP 200, đã nạp `ads-page.css?v=ads-core-split-20260513` và `ads.js?v=ads-core-split-20260513`, không còn `<style>` inline trong HTML.
- Chrome profile `ProductionAdminTest` qua CDP mở production ADS thật: trang không bị chuyển login, loader nạp 12 chunk ADS, tab `Khuyến mãi sàn` và tab con `Tính năng/Cập nhật cache` thao tác được, không có `.ads-error`.
- Mobile CDP 390px trên ADS production: `bodyWidth=390`, `viewportWidth=390`, tab `Khuyến mãi sàn/Tính năng` hiển thị 18 feature card DOM và không tràn ngang.

# 2026-05-13 - Tách core import đơn và chặn Shopee hoàn giả từ trạng thái phụ

## Việc đã làm

- Tách parser import đơn frontend thành các core nhỏ theo sàn: `apps/fe/js/parser/shared.js`, `shopee.js`, `tiktok.js`, `lazada.js`, `orders-v2.js`; `apps/fe/js/parser.js` chỉ còn điều phối.
- Tách HTML/CSS/JavaScript của trang import: `apps/fe/index.html`, `apps/fe/css/import-orders.css`, `apps/fe/js/import-orders.js`.
- Thêm core backend `apps/worker-api/src/core/orders/shopee-status-core.js` để gom phân loại trạng thái Shopee từ Open Platform, không để route `api-sync.js` tự giữ logic phân loại riêng.
- Chặn lỗi Shopee `COMPLETED` bị ghi thành `return`: core mới không trộn `return_status` phụ vào logistics chung và ưu tiên trạng thái hoàn tất trước chữ `RETURN/REFUND` nằm trong trường phụ.
- Parser Shopee import file chỉ tính `Trả hàng/Hoàn tiền` khi có trạng thái xử lý thật; nhãn generic/rỗng/`Không có` không còn bị tính thành đơn hoàn.

## Trạng thái vận hành

- Shop Shopee có API: đồng bộ trạng thái tiếp tục đi qua Open Platform, nhưng `COMPLETED` không bị return-text phụ ghi đè thành Hoàn; Returns API/ledger vẫn là nguồn cần dùng để xác nhận hoàn thật.
- Shop Shopee không API: import file dùng parser mới, phân loại Hủy/Hoàn từ cột file và cost setting như cũ, nhưng đã chặn nhãn generic gây sai KPI.
- Lazada/TikTok: parser được tách file nhỏ, giữ nguyên logic đang chạy; chưa mở thêm endpoint mới trong phase này.

## Kiểm tra

- `node --check` pass cho các module import mới, parser theo sàn, core Shopee status mới và `api-sync.js`.
- Test core Shopee status: `COMPLETED` kèm `RETURN_REFUND` ở trường phụ trả về `normal`; `TO_RETURN` thật vẫn trả về `return`.
- Worker production đã deploy bản `b7ead65c-bccc-4e5e-ab1d-a500358c82ff`.
- Frontend/static assets production đã deploy bản `3c3b8947-48a1-4215-a7d6-ad13d7a1fdad`.
- Chrome profile `ProductionAdminTest` đã mở Dashboard production thật, phiên đăng nhập còn sống; Dashboard tải dữ liệu ngày hiện tại thành công.
- Chrome profile `ProductionAdminTest` đã mở `index.html` production thật; trang import hiển thị tiếng Việt có dấu, `js/import-orders.js` và `css/import-orders.css` đã load.
- In-app browser đã mở `index.html` production và kiểm viewport mobile 390x844, các nhãn chính không bị tràn ngang trong DOM.
- Đã tải file report đơn `shopee_phambich2312_donhang_202604.xlsx` từ R2 và kiểm tra file local cùng tên; cả hai hiện chỉ còn 1 ô header `Mã đơn hàng`, không đủ dòng để khôi phục chính xác từng mã đơn Hủy/Hoàn của tháng 04.
- Dữ liệu production hiện tại của `phambich2312` tháng 04 đang là `Tổng 271 / bán 169 / hủy 24 / hoàn 78`; ảnh ShipXanh người dùng cung cấp là `Tổng 271 / bán 232 / hủy 38 / trả 1`. Chưa chạy sửa tay từng mã đơn vì thiếu file gốc đầy đủ để đối chiếu chính xác.

# 2026-05-12 - Sửa Dashboard phí đóng gói và parser báo cáo sàn

## Việc đã làm

- Tách core Dashboard: `dashboard-summary-core` chuẩn hóa tổng đơn/hủy/hoàn, `operation-cost-core` tính cost setting dùng chung, route phụ Dashboard chuyển sang `dashboard-aux`.
- Frontend Profit Dashboard tách KPI thành `kpi-cost-core`, `kpi-card-render`, `kpi-daily-render`; các file đã đụng đều dưới 20KB.
- KPI chính đổi về `Đơn bán hợp lệ`: tổng đơn bán hợp lệ = tổng đơn - hủy - hoàn, không lấy riêng `completed_orders`.
- Phí đóng gói trong cost setting được chuyển sang `Tổng Phí Sàn`, còn `Chi Phí Vận Hành` chỉ dùng phần vận hành còn lại khi tính lãi để tránh trừ hai lần.
- Parser báo cáo PDF chuyển về server parse theo `pdf_text`, không dùng parser PDF client cũ; sửa Shopee phí sàn/ADS, Shopee phí rút tiền VAT nhỏ, TikTok phí sàn và TikTok phí vận chuyển.
- Làm sạch production bằng cách re-upload lại 8 file báo cáo 2026-04 bị sai hoặc trống số liệu.

## Trạng thái vận hành

- Shop có API: Dashboard vẫn ưu tiên dữ liệu đơn/phí thật đã lưu từ API/Payment/Finance/ADS snapshot; cost setting chỉ bổ sung phí đóng gói và vận hành nội bộ.
- Shop không API: Dashboard dùng dữ liệu import/file đã lưu; cost setting là fallback vận hành, UI đã hiển thị rõ phần đóng gói từ cost setting.
- Shopee: phí sàn không còn bị gán bằng thuế; ADS đọc đúng fee_ads/tax riêng.
- TikTok: hai hóa đơn chi phí/vận chuyển PDF đã có số liệu thay vì raw_data trống.
- Lazada: không đổi endpoint trong phase này; parser Lazada hiện tại không bị ảnh hưởng bởi lỗi đã khoanh.

## Kiểm tra

- `node --check` pass cho Dashboard route/core, report parser, report upload JS và các module KPI mới.
- Parser local pass với 8 file lỗi: Shopee phí sàn/phí rút tiền/ADS và TikTok phí sàn/vận chuyển.
- Worker production đã deploy bản `57ac9df6-0b20-4fa0-b8f6-e7a55ae45e24`.
- Frontend production đã deploy bản `49e1d120-ec24-4a57-9f38-a768c8c3324f`.
- Production API 2026-05-12 trả `success_orders=64`, `total_all_orders=71`, `cancel_orders=6`, `return_orders=1`, cost setting có `Phí Đóng Gói=64.000đ`.
- Chrome profile `ProductionAdminTest` đã mở Dashboard thật: card `Đơn bán hợp lệ` hiển thị `64`, phụ đề `Tổng 71 đơn · Hủy 6 · Hoàn 1`; `Tổng Phí Sàn` có dòng `Đóng gói từ cost setting 64.000đ`; `Chi Phí Vận Hành` ghi đã chuyển đóng gói sang Tổng phí.
- Chrome profile `ProductionAdminTest` đã mở trang báo cáo thật tháng 2026-04: Shopee ADS hiện `8.600.000đ / 2.600.000đ / 1.800.000đ`; TikTok chi phí hiện `6.300.500đ`; TikTok vận chuyển hiện `1.887.773đ`.
- Viewport mobile 390x844 trên Dashboard production: `scrollWidth=390`, không tràn ngang, card đầu hiển thị đúng `Đơn bán hợp lệ 64`.


# 2026-05-11 - Shopee tự tải lại tem khi đơn đã xử lý thiếu PDF

## Việc đã làm

- Tối ưu bot Shopee `refresh_label`: khi đơn ở Seller Center vẫn hiện `Chuẩn bị hàng` thay vì `In phiếu giao`, bot bấm tạo lại tem trước rồi mới bắt PDF, upload R2; chế độ `download_only=true` không tự đổi trạng thái OMS sang `Đã đóng gói`.
- Thêm cơ chế phát hiện giao diện sàn đổi: nếu selector tìm đơn, nút chuẩn bị hàng hoặc nút in tem không còn đúng, bot lưu screenshot, HTML và metadata vào `runtime_jobs/ui-change-alerts`, đồng thời tạo ticket trong inbox Telegram/Codex để báo lỗi có bằng chứng.
- Tách tab theo tác vụ trong cùng một Chrome profile: chat, video, đơn hàng và tải tem có `task_key` riêng để giảm lỗi profile bị khóa hoặc tác vụ cùng shop chen nhau trên một tab.
- OMS khi bấm `Đã đóng gói` cho Shopee/TikTok sẽ kiểm tra tem trước; nếu thiếu tem thì tự tạo job `refresh_label` và dừng chuyển trạng thái để tránh đóng gói khi chưa lưu PDF.
- Radar local tự quét mỗi 60 giây: đơn Shopee đã xử lý quá 1 phút mà chưa có tem sẽ được gom thành job `refresh_label` nguồn `auto_processed_missing_label`.

## Trạng thái vận hành

- Shop Shopee có API: tiếp tục ưu tiên endpoint/API nếu có quyền tải tem chính thức; luồng này không bị đổi.
- Shop Shopee chưa API: dùng Chrome helper có kiểm soát, tải lại tem qua Seller Center, lưu log/job và không tự đổi trạng thái đơn khi chỉ lấy tem.
- Lazada: không đổi trong phase này, vẫn dùng endpoint Fulfillment `PrintAWB` đã nối trước đó.
- TikTok: giữ luồng `refresh_label` đã vá ngày 2026-05-09; phần OMS chặn đóng gói thiếu tem áp dụng thêm cho TikTok.

## Kiểm tra

- `python -m py_compile` pass cho các module browser/tab/task và Shopee process đã sửa.
- `node --check apps/fe/js/modules/oms-actions.js` pass.
- Frontend production đã deploy bản `f159beb2-6cb3-48b5-a232-430da33759ee`, fetch live xác nhận `oms-actions.js` có guard Shopee/TikTok kiểm tem trước khi đóng gói.
- Radar local đã restart, health trả `radar_running=true`, PID `21988`.
- Kiểm thật profile Shopee `phambich2312`: ô tìm đơn, nút `Chuẩn bị hàng` và nút `In phiếu giao` đều nhận diện được, không rơi vào trạng thái cần đăng nhập.
- Kiểm thật tải tem an toàn cho đơn `2605114SM3EN9P`: bot tải PDF về `Phieu_In_PDF`, upload R2 thành công, không đổi trạng thái OMS.
- Kiểm thật auto retry: job `463` trước patch lỗi vì Shopee chỉ hiện `Chuẩn bị hàng`; sau patch Radar tự tạo job `464`, hoàn tất cho `2605103NWWV4R4` và `2605103GCHMR0T`. `/api/labels/status` sau đó trả `has_label=true` cho `2605114SM3EN9P`, `2605103NWWV4R4`, `2605103GCHMR0T`.

# 2026-05-10 - Mở bảng tính năng khuyến mãi và kiểm một lượt các module

## Việc đã làm

- Thêm tab `Tính năng` trong `Khuyến mãi sàn`, hiển thị rõ 9 nhóm: Shopee Discount, Shopee Voucher, Shopee Bundle, Shopee Add-On, Shopee Flash Sale, Lazada Voucher, Lazada Freeship, Lazada Flexicombo, Lazada Early Bird.
- Mỗi thẻ tính năng có trạng thái đọc cache, trạng thái ghi thật và nút thao tác đúng luồng: cập nhật cache, xem danh sách, chọn SKU/preview hoặc mở Discount & đẩy giá.
- Tab `Cập nhật cache` đổi sang dựng nút nhanh từ cùng một catalogue tính năng, hiện 11 thẻ: 9 tính năng + `Toàn bộ read-only` + `Kiểm tra dữ liệu`.
- Sửa hiển thị danh sách chương trình để tách rõ `cache item/SKU` và `sàn báo`, tránh nhầm Flash Sale có item trong list là đã có đủ item chi tiết trong cache.
- Cập nhật `promotion_tool_core`: Shopee Discount ghi thật được đánh dấu `write_live_guarded`; các module còn lại vẫn `write_locked` hoặc `preview_only_locked`.
- Bump cache script ADS sang `ads.js?v=promotion-feature-hub-20260510b`.

## Trạng thái vận hành

- Shop có API: tất cả module đã nối có nút cập nhật/xem danh sách rõ ràng; Shopee Discount là module duy nhất mở ghi giá thật sau xác nhận OK.
- Shop không API: không đổi, chỉ dùng dữ liệu tham chiếu/import/browser có log; UI không gắn nhãn ghi Open Platform cho shop chưa có API.
- Flash Sale/Bundle/Add-On/Voucher/Freeship/Flexicombo/Early Bird: mở phần nhìn, cập nhật, danh sách, chi tiết và preview/hàng đợi nếu có dữ liệu; chưa mở nút gửi thật lên sàn.

## Kiểm tra

- `node --check apps/fe/js/dashboard/ads.js` pass.
- `node --check apps/worker-api/src/core/promotion-tool-core.js` pass.
- `git diff --check -- apps/fe/pages/ads.html apps/fe/js/dashboard/ads.js apps/worker-api/src/core/promotion-tool-core.js` pass.
- Worker API production đã deploy bản `43a2ab75-9710-444b-b773-46961ddcfbb9`.
- Frontend production đã deploy bản cuối `8f93a46c-4b89-4903-b5fe-633675714081`.
- Fetch live xác nhận `ads.html` tải `ads.js?v=promotion-feature-hub-20260510b`.
- Mở production bằng Chrome profile kiểm thử: tab `Tính năng` có đủ `9` thẻ, gồm `Shopee Flash Sale`; tab `Cập nhật cache` có `11` thẻ thao tác.
- Bấm chạy `Cập nhật toàn bộ read-only` trên production: `6/6` lượt OK, gồm Shopee Voucher `721`, Shopee Bundle `54/34`, Shopee Add-On `155/237`, Shopee Flash Sale `100/57`, Lazada Voucher `42/5`, Lazada promotion `2/0`.
- Mở nhanh `Shopee Flash Sale`: danh sách tải `80` dòng; dòng đầu hiển thị đúng `cache 0 item/SKU · sàn báo 9`, không còn gây hiểu nhầm là chi tiết đã có đủ item.
- Viewport mobile `390x844`: `featureCards=9`, `scrollWidth=390`, không tràn ngang; thẻ tính năng rộng `356px`.

# 2026-05-10 - Mở đẩy giá Shopee Discount có xác nhận OK

## Việc đã làm

- Mở nút `Đẩy giá Shopee Discount` trong tab `Cập nhật cache` để đi thẳng tới danh sách Discount & tồn kho.
- Đổi nút thao tác từng dòng Discount thành `Tùy chỉnh / đẩy giá`, trong modal có nút `Đẩy giá lên Shopee`.
- Thêm hộp xác nhận OK/Cancel trước khi gửi giá thật qua Shopee Discount API `update_discount_item`; bấm hủy thì không gọi API.
- Backend mở route `POST /api/discounts/promotions/apply-queue/execute` cho hàng đợi đã duyệt, chỉ hỗ trợ Shopee Discount và vẫn yêu cầu quyền admin + chuỗi xác nhận nội bộ `APPLY_PROMOTION_QUEUE`.
- Backend chặn thao tác `execute=true` ở `/api/discounts/shopee/action` nếu không có quyền admin.
- Bump cache script ADS sang `ads.js?v=promotion-live-price-20260510a`.

## Trạng thái vận hành

- Shop có API: Shopee Discount có thể đẩy giá thật qua `update_discount_item` sau khi người vận hành bấm OK; dòng đang gộp nhiều phân loại vẫn bị chặn để tránh sai giá.
- Shop không API: không đổi, vẫn chỉ dùng dữ liệu tham chiếu/import/browser có log; không gắn nhãn đẩy giá bằng Open Platform.
- Bundle/Add-On/Flash Sale/Voucher/Freeship/Flexicombo/Early Bird vẫn khóa ghi thật cho tới khi có adapter payload riêng và rule duyệt/rollback đầy đủ.

## Kiểm tra

- `node --check apps/fe/js/dashboard/ads.js` pass.
- `node --check apps/worker-api/src/routes/discounts.js` pass.
- `git diff --check -- apps/fe/pages/ads.html apps/fe/js/dashboard/ads.js apps/worker-api/src/routes/discounts.js` pass.
- Worker API production đã deploy bản `76b17523-92ec-4360-b9a2-5088fba287b8`.
- Frontend production đã deploy bản `ab2883f7-05da-4d84-94c7-b861b4ce2d9c`.
- Fetch live xác nhận `ads.html` tải `ads.js?v=promotion-live-price-20260510a` và JS live có `executePromotionQueueApply`, `PROMOTION_QUEUE_EXECUTE_CONFIRM`, `openShopeeDiscountApplyPanel`.
- API production không đăng nhập bị chặn an toàn: `/api/discounts/shopee/action` với `execute=true` trả `403`, `/api/discounts/promotions/apply-queue/execute` không có queue hợp lệ không gửi lệnh thật.
- Mở production bằng Chrome profile kiểm thử: danh sách Discount tải `202` dòng, nút `Tùy chỉnh / đẩy giá` hiển thị trên từng dòng.
- Kiểm tra luồng thật trên dòng đủ điều kiện của shop `chihuy2309`: bấm `Đẩy giá lên Shopee` hiện hộp xác nhận; nhánh hủy trả `Đã hủy đẩy giá lên Shopee. Chưa có thay đổi nào được gửi.`
- Viewport mobile `390x844`: tab `Cập nhật cache` có `11` thẻ thao tác, không tràn ngang, thẻ `Đẩy giá Shopee Discount` hiển thị đúng.

# 2026-05-10 - Hiển thị nút cập nhật nhanh cho core khuyến mãi

## Việc đã làm

- Bổ sung lưới nút nhanh trong tab `Cập nhật cache` của `Khuyến mãi sàn`: Shopee Voucher, Shopee Bundle, Shopee Add-On, Shopee Flash Sale, Lazada Voucher, Lazada Freeship, Lazada Flexicombo, Toàn bộ read-only, Kiểm tra dữ liệu và Lazada Early Bird khóa ghi thật.
- Thêm hàm `syncPromotionQuickFeature` để mỗi nút tự đặt đúng bộ lọc nguồn/sàn/module/trạng thái rồi chạy lại luồng cập nhật cache read-only hiện có.
- Giữ nút `Lazada Early Bird` ở trạng thái disabled vì đây là nhóm endpoint có thể ghi giá thật; UI chỉ hiển thị để người vận hành biết tính năng đang có nhưng chưa mở apply.
- Bump cache script ADS sang `ads.js?v=promotion-core-quick-actions-20260510a`.

## Trạng thái vận hành

- Shop có API: các nút nhanh chỉ gọi endpoint read-only đã nối, lưu cache D1 và đọc lại qua `promotion_tool_core`; không gửi lệnh tạo/sửa/tắt/kích hoạt khuyến mãi thật lên sàn.
- Shop không API: không đổi, vẫn dùng dữ liệu tham chiếu/import/browser có log; không được gắn nhãn cập nhật Open Platform nếu shop chưa có API.
- Tính năng ghi thật vẫn khóa: hàng đợi duyệt/preview chỉ lưu payload nội bộ, chưa có adapter gửi thật lên từng endpoint promotion.

## Kiểm tra

- `node --check apps/fe/js/dashboard/ads.js` pass.
- `git diff --check -- apps\fe\pages\ads.html apps\fe\js\dashboard\ads.js` pass.
- Frontend production đã deploy bản `3a0bcd4e-32a1-4989-a302-27ae272bd1dc`.
- Fetch live xác nhận `ads.html` tải `ads.js?v=promotion-core-quick-actions-20260510a` và JS live có `syncPromotionQuickFeature`.
- Mở production bằng Chrome profile kiểm thử, tab `Cập nhật cache` hiển thị `10` thẻ nút nhanh, `12` nút thao tác và `1` nút khóa `Lazada Early Bird`.
- Bấm thật nút nhanh `Shopee Bundle` trên production: bộ lọc tự chuyển sang `Chương trình / Shopee / Shopee Bundle / Tất cả`, kết quả `Shopee Shopee Bundle: OK · chương trình/voucher 54 · item/detail 65`.
- Viewport mobile `390x844`: `bodyWidth=390`, `viewportWidth=390`, không tràn ngang; các thẻ nút nhanh vẫn hiển thị đủ.

# 2026-05-10 - Sắp xếp lại UI core khuyến mãi và thêm cập nhật theo bộ lọc

## Việc đã làm

- Tách panel `Khuyến mãi sàn` trong ADS thành các tab con: `Tổng quan core`, `Cập nhật cache`, `Danh sách`, `Chi tiết / giá`, `Hàng đợi duyệt`.
- Chuyển các nút cập nhật ra tab riêng để không dồn chung với danh sách/chi tiết SKU.
- Thêm nút `Cập nhật theo bộ lọc`: dùng chung bộ lọc nguồn/sàn/module/trạng thái để chạy đúng endpoint read-only cần cập nhật, thay vì luôn chạy toàn bộ module.
- Bump cache script ADS sang `ads.js?v=promotion-core-tabs-20260510a`.

## Trạng thái vận hành

- Shop có API: cập nhật cache vẫn chỉ gọi endpoint read-only cho Shopee Discount/Voucher/Bundle/Add-On/Flash Sale và Lazada Voucher/Free Shipping/Flexicombo, lưu về D1 rồi đọc lại qua `promotion_tool_core`.
- Shop không API: không đổi, chỉ dùng dữ liệu tham chiếu/import/browser có log; không gắn nhãn tạo/sửa promotion bằng Open Platform.
- Thao tác ghi thật tạo/sửa/tắt/kích hoạt khuyến mãi vẫn khóa ở tầng gửi sàn; UI mới chỉ giúp cập nhật cache, xem danh sách, xem chi tiết SKU, dựng preview giá theo tồn và đưa vào hàng đợi duyệt.

## Kiểm tra

- `node --check apps/fe/js/dashboard/ads.js` pass.
- `git diff --check -- apps\fe\js\dashboard\ads.js apps\fe\pages\ads.html` pass.
- API production `/api/discounts/promotion-tool-core?limit=3` trả `mode=promotion_tool_core`, `done=8/9`, `locked=8`, có `3` dòng ADS overlap.
- Frontend production đã deploy bản `b1cdde0b-c0e5-4559-9501-1d366183fe5e`.
- Fetch live xác nhận `ads.html` tải `ads.js?v=promotion-core-tabs-20260510a`.
- Mở production `ads.html#promotionCorePanel`: tab `Tổng quan core` hiện `8/9 module đã nối · 8 module khóa ghi thật`; tab con hiển thị đúng `Tổng quan core | Cập nhật cache | Danh sách | Chi tiết / giá | Hàng đợi duyệt`.
- Trên production, chạy `Cập nhật theo bộ lọc` với `Chương trình / Shopee / Shopee Bundle / Tất cả`: kết quả `Shopee Shopee Bundle: OK · chương trình/voucher 54 · item/detail 65`.
- Tab `Danh sách` lọc Shopee Bundle tải được `54` dòng chương trình; viewport mobile `390x844` không tràn ngang.

# 2026-05-10 - Làm rõ UI gửi ảnh/video API trong Chat sàn

## Việc đã làm

- Sửa giao diện khung soạn chat để người vận hành nhìn thấy ngay trạng thái `Ảnh/video API`, thay vì chỉ hiện thông báo sau khi chọn file.
- Desktop đổi nút `Ảnh/video` thành `Ảnh/video API` và thêm dòng trạng thái ngắn: hệ thống sẽ thử gửi qua API, nếu sàn từ chối vẫn lưu OMS để đối chiếu.
- Mobile đổi nút thao tác nhanh thành `Ảnh/video API`, đổi menu đính kèm thành `Album API`/`Chụp API`, và giữ dòng trạng thái media hiển thị trong thread mobile.
- Bump cache asset sang `chat-media-ui-status-20260510a` cho cả CSS và JS.

## Trạng thái vận hành

- Shop API: UI cho thấy rõ media sẽ đi luồng API nếu shop hỗ trợ; phần gửi thật vẫn dùng backend guard đã mở ở mục trước.
- Shop không API: không đổi luồng, vẫn fallback helper/local theo trạng thái shop; UI chỉ báo thử API khi hội thoại/shop hỗ trợ ở backend.

## Kiểm tra

- `node --check apps/fe/js/dashboard/chat.js` pass.
- `git diff --check` cho `chat.js`, `dashboard.css`, `chat-marketplace.html`, `profit-dashboard.html` pass.
- Frontend production đã deploy bản `a444965f-e38f-4a2c-be68-dbdf0233525f`.
- Fetch live xác nhận `chat-marketplace.html` tải `chat.js?v=chat-media-ui-status-20260510a`, `dashboard.css?v=chat-media-ui-status-20260510a`, và JS live có `updateChatMediaApiStatus`.
- Mở production bằng Chrome profile kiểm thử: desktop hiện `Ảnh/video API: thử gửi qua API, lỗi vẫn lưu OMS.`, nút `Ảnh/video API` không bị disabled khi đã chọn hội thoại.
- Viewport mobile `390x844`: bấm hội thoại mở thread full màn hình, dòng `Ảnh/video API` hiện trong khung soạn; chọn file test đổi sang `Đã chọn 1 file, bấm Gửi để thử đưa lên sàn.`, preview hiện và `overflowX=false`.

# 2026-05-10 - Mở gửi ảnh/video Shopee Chat qua API có fallback URL OMS

## Việc đã làm

- Mở luồng gửi media trong `/api/chat/send` cho Shopee API shop: ảnh/video không còn bị khóa ở mức chỉ lưu OMS.
- Backend vẫn ưu tiên đúng flow Shopee trước: `v2.sellerchat.upload_image` cho ảnh, `v2.sellerchat.upload_video` -> `v2.sellerchat.get_video_upload_result` cho video, sau đó mới gọi `v2.sellerchat.send_message`.
- Nếu endpoint upload chính thức còn trả `param_error` do thiếu schema chi tiết, backend thử nhánh fallback có kiểm soát: gửi `message_type=image` bằng URL media OMS hoặc `message_type=video` bằng `video_url`/`thumb_url` media OMS.
- Frontend đổi trạng thái chọn media sang đúng thực tế vận hành: hệ thống sẽ thử gửi ảnh/video lên sàn qua API và vẫn lưu OMS để đối chiếu nếu sàn từ chối.

## Trạng thái vận hành

- Shop API `chihuy2309`: text từ đơn đã gửi thật; ảnh/video đã mở tới bước sinh payload production có URL tuyệt đối để gửi qua SellerChat API.
- Official Shopee upload media chưa chốt schema: sample probe `upload_image` vẫn gọi tới endpoint được nhưng mọi biến thể `image/file/image_file/images/upload_image/base64/data_url` trả `param_error`; video upload/result cũng chỉ xác nhận endpoint tới được.
- Shop không API: không đổi, vẫn fallback helper local/browser có log; không gắn nhãn đồng bộ API cho shop chưa có API.

## Kiểm tra

- `node --check apps/worker-api/src/routes/chat.js` pass.
- `git diff --check -- apps\worker-api\src\routes\chat.js` pass.
- Worker API production đã deploy bản `7aad56bd-dcea-43e5-8310-9faf64c4b83b`.
- Frontend production đã deploy bản `c266b67e-a4cb-4b55-91c7-ca126b066b61`.
- Dry-run production ảnh cho hội thoại `automation-shopee-seed-nhe6qz` trả payload `message_type=image` với URL media OMS tuyệt đối.
- Dry-run production video cho hội thoại `automation-shopee-seed-nhe6qz` trả payload `message_type=video` với `video_url` media OMS tuyệt đối.
- Probe production `POST /api/chat/shopee-permission-probe` cho `chihuy2309` xác nhận `sellerchat_upload_image_sample` vẫn là `param_error`, nên chưa báo upload chính thức đã xong.
- Mở production `chat-marketplace.html?verify=chat-media-direct-fallback-20260510a`, asset mới đã load và thao tác chọn file hiển thị guard: `Đã chọn 1 ảnh/video, hệ thống sẽ thử gửi lên sàn qua API.`

# 2026-05-10 - Gửi tin nhắn Shopee từ đơn hàng có ngữ cảnh order

## Việc đã làm

- Sửa Worker chat Shopee để khi `/api/v2/sellerchat/send_message` trả `first_chat_without_order_info`, hệ thống tự lấy đơn liên kết từ hội thoại seed OMS và gửi lại text kèm `source_type=order` + `source_content.order_sn`.
- Giữ luồng chuẩn cho shop Shopee có API: dùng `buyer_user_id` từ Order API làm `to_id`, không ép sang helper Chrome nếu API có đủ dữ liệu.
- Nếu Shopee vẫn yêu cầu thẻ đơn trước tin text, backend có nhánh bootstrap thẻ đơn với `message_type=order`, rồi mới gửi lại nội dung text; nhánh này chỉ chạy sau lỗi order context, không gửi đại trà.

## Trạng thái vận hành

- Shop API `chihuy2309`: nút `Nhắn khách` từ đơn OMS hiện gửi được text thật qua Shopee SellerChat API cho hội thoại seed từ đơn.
- Shop không API: không đổi, vẫn fallback helper local/browser có kiểm soát và log riêng.
- Shopee vẫn chưa có endpoint public riêng để mở thread từ `order_sn`, nhưng lỗi text đầu tiên từ đơn đã xử lý bằng `send_message` kèm order context.

## Kiểm tra

- `node --check apps/worker-api/src/routes/chat.js` pass.
- Worker API production đã deploy bản `34bb0212-e7e5-4682-98d9-8a9294b4bb78`.
- Gửi thật production nội dung `ok` cho shop `chihuy2309`, đơn `260508T7H2B2A8`, hội thoại `automation-shopee-seed-nhe6qz`: Shopee trả HTTP 200, `message_id=2412547899391328626`, `request_id=e3e3e7f351723c62239d455a48341400`.
- D1 remote đã lưu message `ok` với `delivery_status=sent_to_platform`, payload có `to_id=243511413`, `source_type=order`, `source_content.order_sn=260508T7H2B2A8`.
- Mở production OMS bằng Chrome CDP, bấm luồng `Nhắn khách` cho đơn `260508T7H2B2A8`: vào đúng hội thoại `phuongto.rt`, ô trả lời không khóa và vùng tin nhắn hiển thị `ok sent_to_platform`.

# 2026-05-10 - Sửa responsive giao diện Chat sàn trên mobile, tablet và desktop

## Việc đã làm

- Trang riêng `chat-marketplace.html` chuyển sang app shell cao đúng `100dvh`, khóa cuộn ngoài trang và để từng vùng chat tự cuộn trong panel.
- Mobile/tablet ẩn quick nav, danh sách hội thoại chiếm đúng phần còn lại của màn hình, mở hội thoại thành thread full màn hình, header gọn còn 55px và không còn đẩy ô gửi xuống dưới viewport.
- Desktop giữ bố cục 3 cột nhưng nén cụm soạn trả lời, bỏ `min-height` cứng của vùng tin nhắn để khung gửi luôn nằm trong panel.
- Bump cache asset sang `chat-responsive-shell-20260510c` để trình duyệt vận hành lấy CSS/JS mới ngay.

## Trạng thái vận hành

- Không thay đổi endpoint chat, quyền API, canary AI auto-reply hoặc logic gửi tin.
- Shop có API và shop không API giữ nguyên luồng hiện tại; thay đổi này chỉ sửa giao diện đọc/soạn chat trên web.

## Kiểm tra

- `node --check apps/fe/js/dashboard/chat.js` pass.
- Frontend production đã deploy bản `e5e2ecdb-293a-4fb0-936b-36774970d436`.
- Production profile `ProductionAdminTest` đã mở `chat-marketplace.html?verify=chat-responsive-shell-20260510c`, đợi danh sách 60 hội thoại tải xong và bấm hội thoại `phamvanthao010`.
- Viewport `390x844`, `430x932`, `768x1024`, `1366x768` đều không tràn ngang/dọc (`overflowX=false`, `overflowY=false`).
- Mobile/tablet thread full màn hình: header `55px`, ô gửi nằm đúng đáy viewport; desktop `1366x768` panel thread cao `493px`, ô gửi cao `167px`, đáy ô gửi `747/768`, không bị cắt.

# 2026-05-09 - OMS popup phí hiển thị giảm giá, TTLK và ADS từ API

## Việc đã làm

- OMS `/api/orders` bóc thêm dữ liệu giảm giá từ raw Shopee escrow trong `order_fee_details.raw_data`: `voucher_from_seller`, `seller_discount`, `voucher_from_shopee`, `shopee_discount`, `coins`.
- Core `order-fee-phase1-core` thêm nhóm đối soát riêng `Giảm giá / TTLK / ADS`, không cộng trùng vào tổng phí đã chốt.
- Popup phí trong OMS hiển thị rõ `Voucher/giảm giá shop`, `Sàn hỗ trợ khách`, `Phí TTLK từ API`, `Phí ADS từ API`; nếu API chưa có bucket thì ghi `Chưa có` và nêu phần đang ước tính bằng cost setting.

## Trạng thái vận hành

- Shopee có Payment API: giảm giá/voucher đọc từ `shopee.payment.get_escrow_detail` đã lưu ở `order_fee_details.raw_data`; TTLK/ADS đọc từ cột `fee_affiliate`/`fee_ads` khi API có trả.
- Lazada có Finance API: TTLK/ADS vẫn đọc từ `order_fee_details` nếu transaction finance đã phân bucket; giảm giá chi tiết chỉ hiện khi đơn/import hoặc finance đã có dữ liệu tương ứng, không tạo số giả.
- Shop không có API: popup chỉ hiện phần đối soát là `Chưa có API` hoặc dữ liệu từ `orders_v2`, cost setting vẫn được ghi rõ là ước tính.

## Kiểm tra

- `node --check apps/worker-api/src/routes/orders.js` pass.
- `node --check apps/worker-api/src/core/order-fee-phase1-core.js` pass.
- `node --check apps/fe/js/modules/oms-render.js` pass.
- `node --check apps/fe/js/oms-main.js` pass.
- Worker API production: `2b929796-caa3-460d-8dd4-335c6abb60e1`.
- Frontend production: `ac0c21c8-16a5-4cf4-bc73-1746dc2e4269`.
- API production `/api/orders?search=2605090WM2FCFB` trả `Voucher/giảm giá shop 10.000đ`, `Sàn hỗ trợ khách 11.250đ`, `Phí TTLK từ API 0đ`, `Phí ADS từ API: Chưa có`.
- Production UI mở `oms-dashboard.html?v=fee-api-compare-20260509`, bấm chip `Phí API + ước tính: 15.600đ` của đơn `2605090WM2FCFB`; tooltip có nhóm `Đối soát giảm giá / TTLK / ADS` và đủ các dòng trên.

# 2026-05-09 - Profit Dashboard đọc bucket phí thật từ order_fee_details

## Việc đã làm

- Sửa `/api/dashboard` để card `Tổng Phí Sàn` không chỉ đọc các cột bucket đang rỗng trong `orders_v2`.
- Backend ưu tiên gom phí chi tiết từ `order_fee_details`: hoa hồng/cố định, thanh toán, dịch vụ, TTLK, PiShip, xử lý/fulfillment, logistics, VAT/PIT sàn khấu trừ.
- Chi ADS lấy thêm từ `marketplace_ads_campaign_snapshots` theo đúng khoảng ngày/shop/sàn đang lọc; nếu `order_fee_details.fee_ads` rỗng thì vẫn hiện được spend ADS thật đã sync.
- Frontend hiển thị rõ số đơn đã có dòng phí chi tiết, số dòng ADS snapshot và phần `Tổng phí còn thiếu bucket` chỉ còn là phần chưa có Payment/Finance detail.

## Trạng thái vận hành

- Shop có API/payment/finance: bucket phí thật đọc từ `order_fee_details`, không còn bị 0 giả do `orders_v2` chưa backfill bucket.
- Shop có ADS snapshot: `Phí ADS` hiện theo spend thật trong `marketplace_ads_campaign_snapshots`.
- Shop chưa có Payment/Finance detail: vẫn giữ tổng phí từ `orders_v2.fee` trong phần chưa tách để không làm sai lợi nhuận.

## Kiểm tra

- `node --check apps/worker-api/src/routes/dashboard.js` pass.
- `node --check apps/fe/js/dashboard/kpi.js` pass.
- Worker API production: `f254df2d-02dd-48bc-8220-19ad8bdbd6c3`.
- Frontend production: `f3d53749-a21c-49de-8db9-665000c65fd6`.
- API production `/api/dashboard?from=2026-05-09&to=2026-05-09` trả bucket chi tiết: hoa hồng `273.783đ`, dịch vụ `99.000đ`, thanh toán `145.162đ`, ADS snapshot `25.303đ`, PiShip `34.020đ`, VAT/PIT sàn `34.619đ`, `33/50` đơn có chi tiết phí.
- Production UI mở thật `profit-dashboard.html?v=fee-buckets-20260509`, bung card `Tổng Phí Sàn`: thấy `Đã tách 612k · còn thiếu 740k`, `Phí ADS 25.303đ`, `Dòng đã có chi tiết phí 33/50 đơn`, `Dòng ADS snapshot 16 dòng`, không còn các bucket chi tiết bị 0 giả.

# 2026-05-09 - Chat thêm theo dõi vận chuyển và làm mới hội thoại đang mở

## Việc đã làm

- Tab `Đơn hàng` trong chat thêm nút `Theo dõi vận chuyển` ngay trên từng thẻ đơn để CSKH kiểm tra hành trình trước khi trả lời khách.
- Shopee có API sẽ gọi endpoint đọc logistics `get_tracking_info` qua route vận hành đọc-only; nếu API lỗi hoặc shop không có API thì UI hiển thị hành trình fallback từ dữ liệu OMS đã đồng bộ.
- Có nút `Chèn hành trình` để đưa câu trả lời vận chuyển vào ô chat, kèm mã vận đơn, đơn vị vận chuyển và thời gian cập nhật nếu API trả về.
- Polling chat đổi sang luôn reload lại hội thoại đang mở; không còn phụ thuộc hoàn toàn vào số `pulled_messages/saved_messages` backend trả về.
- Nút `Làm mới tin nhắn` khi gặp hội thoại Shopee/TikTok fallback sẽ gọi helper Chrome có kiểm soát, thay vì chỉ chạy API rồi bỏ qua shop không API.
- Bump cache `chat.js` trên `profit-dashboard.html` và `chat-marketplace.html` sang `chat-logistics-realtime-20260509`.

## Trạng thái vận hành

- Shop có API: ưu tiên API chat để kéo tin nhắn; riêng nút vận chuyển của Shopee đọc logistics thật từ endpoint sàn nếu token còn sống.
- Shop không có API: tin nhắn đi qua helper Chrome theo `chat_transport_core`; hành trình đơn hàng chỉ hiện từ OMS/manual reference, không gắn nhãn realtime API.
- Lazada/TikTok logistics trong chat hiện đọc dữ liệu OMS đã đồng bộ trước; chưa tự gọi live logistics nếu chưa có endpoint route đọc riêng đã kiểm.

## Kiểm tra

- `node --check apps/fe/js/dashboard/chat.js` pass.
- `node --check apps/worker-api/src/routes/chat.js` pass.
- Quét mojibake trong `chat.js` và `dashboard.css` không thấy `Ã`, `Â`, `áº`, `á»`, `ðŸ`, `â€¦`.
- Frontend Pages đã deploy bản `ade7404b-6b97-4b54-b26e-28f5e30823f4`; Worker API đã deploy bản `ab4da959-9d18-4408-8686-ea5b9923d97b`.
- Production `chat-marketplace.html?verify=chat-logistics-realtime-20260509` đã mở hội thoại `vinhto498`, thấy nút `Theo dõi vận chuyển`, gọi được Shopee logistics API và hiển thị timeline `PICKED_UP / ORDER_CREATED`.
- Đã chèn nháp hành trình vào ô trả lời, guard không còn chặn nhầm `SPXVN...` hoặc chữ `vận chuyển`. API `/api/chat/guard` trả `allowed: true` cho nội dung có mã vận đơn.

# 2026-05-09 - Profit Dashboard tách phí sàn, lý do hủy tiếng Việt và doanh thu năm

## Việc đã làm

- Card `Tổng Phí Sàn` bổ sung bucket `Đóng gói/vận hành/labor` và đổi phần chưa tách được thành nhãn nghiệp vụ rõ hơn, không còn chỉ ghi `orders_v2.fee`.
- API `/api/cancel-stats` chuẩn hóa thêm `cancel_reason_vi` để frontend hiển thị lý do hủy bằng tiếng Việt; đồng thời hỗ trợ lọc nhiều shop trong cùng request.
- Tab `Doanh thu Năm` đổi sang báo cáo năm theo `report_month`, ép range về nguyên năm, thêm KPI doanh thu chốt, tiền sàn trả, phí sàn, ADS, hoàn/refund, vốn, vận hành, thuế và lãi bỏ túi.
- Bảng doanh thu năm bỏ cột ngày, chỉ còn tháng + sàn/shop + các khoản tổng hợp tháng/năm.
- Bộ chọn shop trên dashboard gom nhiều lựa chọn thành nhãn `Đã chọn N shop` để không chiếm giao diện trên mobile.

## Trạng thái vận hành

- Shop có API/payment/report: đọc dữ liệu thật đã lưu trong `orders_v2`, `order_fee_details`, `platform_reports` và report ADS đã import/sync.
- Shop không có API: phần phí chưa có bucket vẫn giữ nguồn fallback rõ ràng từ `orders_v2.fee` hoặc cost setting, không ghi nhầm là phí API chính thức.
- Shopee/Lazada/TikTok cùng dùng UI lọc nhiều shop; lý do hủy chỉ dịch các mã phổ biến, mã chưa biết vẫn giữ raw để không làm mất dữ liệu gốc.

## Kiểm tra

- `node --check` pass cho `monthly.js`, `kpi.js`, `cancel.js`, `ShopTreePicker.js`, `dashboard.js`.
- Quét mojibake các file vừa sửa không thấy `Ã`, `Â`, `áº`, `á»`, `ðŸ`, `â€¦`.
- `git diff --check` cho cụm file vừa sửa không có lỗi whitespace thật.
- Worker API production: `a3be1a48-7616-43da-b52e-01b8e988eff7`.
- Frontend production: `2e716fdc-8317-4658-babe-30a93b762679`.
- Production UI mở thật `profit-dashboard.html#monthly`: thấy `Doanh thu Năm`, KPI `Chi phí ADS`, bảng `Bảng tổng kết doanh thu năm theo tháng`, không còn cột ngày trong bảng năm và số tiền đã làm tròn theo đồng.
- Production UI mở card `Tổng Phí Sàn`: thấy đủ `Phí Tiếp Thị Liên Kết`, `Phí ADS`, `Phí PiShip`, `Đóng gói/vận hành/labor` và nhãn `Chưa tách được từ dữ liệu sàn`.
- Production UI mở tab `Hủy / Hoàn`: lý do hủy hiển thị tiếng Việt như `Khách muốn chỉnh sửa đơn`, `Khác / khách đổi ý`, `Khách tìm được giá rẻ hơn`; không còn các mã tiếng Anh kiểu `Modify existing order`.
- Production UI chọn thử 2 shop trong bộ lọc: ô shop chuyển thành `Đã chọn 2 shop`; đã bấm `Reset` lại sau khi kiểm.

# 2026-05-09 - Trung tâm video hiển thị tiến trình tải thư viện và xác nhận xóa bằng modal

## Việc đã làm

- UI `Video đã đăng` thêm tiến trình khi bấm `Tải lại toàn bộ Shopee`: hiện trang đang quét, số video đã quét/tổng Shopee trả về, số dòng đã lưu/cập nhật và cảnh báo nếu API trả warning.
- Nút tải thư viện và nút xóa bị khóa trong lúc đang chạy để tránh bấm lặp gây trùng request.
- Xóa video Shopee không còn bắt nhập `XOA VIDEO`; hệ thống mở modal xác nhận có bảng video sẽ xóa, mã video/post, trạng thái và số video tiêu đề cần xử lý.
- Nếu chọn hơn 100 video, frontend tự chia lô tối đa 100 video/lần, mỗi lô backend vẫn xóa theo chuẩn Shopee tối đa 5 id/lệnh. UI hiển thị tiến trình lô đang xóa, số đã xóa và số lỗi.
- Backend `/api/video/delete` vẫn giữ guard xác nhận, nhưng nhận `confirmed=true` từ modal và hỗ trợ `refresh_after_delete=0` để xóa nhiều lô mà chỉ refresh thư viện ở lô cuối.

## Trạng thái vận hành

- Shop Shopee có Video API: tải thư viện và xóa video vẫn gọi Shopee Video API thật, có log backend.
- Shop Shopee chưa đủ Video API: vẫn bị khóa theo capability, không giả lập xóa hoặc tải.
- Lazada/TikTok không bị ảnh hưởng trong phase này; Lazada video vẫn đi luồng Media Center riêng.

## Kiểm tra

- `node --check apps/fe/js/video-dashboard.js` pass.
- `node --check apps/worker-api/src/routes/video.js` pass.
- `git diff --check` cho `video-dashboard.js`, `video-dashboard.css`, `dashboard_video.html`, `video.js` không có lỗi whitespace thật.
- Worker API production: `c05e0d0c-15ca-497c-b34e-8ede4bdcd93b`.
- Frontend production: `448fe55d-f19e-495c-b0f3-6cb4c70a412b`.
- Production UI mở thật `dashboard_video.html?view=library&shop=chihuy1984`, bấm `Tải lại toàn bộ Shopee`: tiến trình hiển thị từng cụm trang, giữa luồng thấy `Đã quét khoảng 200/308 video đã đăng`, kết thúc báo `Đã quét 308/308 video đã đăng, lưu/cập nhật 315 dòng` và không còn cảnh báo sai.
- Production UI bấm `Xóa` từng dòng và `Xóa đã chọn`: đều mở modal `Xác nhận xóa video`, có nút `Hủy`/`Xác nhận xóa`, không còn yêu cầu nhập `XOA VIDEO`. Chỉ kiểm modal và hủy, không bấm xóa thật.

# 2026-05-09 - Đăng đa sàn lấy đủ media/ngành/thuộc tính từ bài nguồn

## Việc đã làm

- Backend `publish-draft-preview` và `publish-draft` đã lấy thêm dữ liệu chuẩn từ `marketplace_product_knowledge` thay vì chỉ dùng dòng SKU local.
- Payload bản nháp bài đăng hiện gom đủ: tên, mô tả, ảnh, video, ngành hàng nguồn, thương hiệu, thuộc tính ngành hàng, cân nặng, kích thước nếu sàn có trả, logistics và trạng thái đủ/thiếu dữ liệu.
- UI modal `Đăng sản phẩm đa sàn` thêm ô `Thuộc tính ngành hàng`, tự điền video/ảnh/ngành/thuộc tính/cân nặng từ bài nguồn sau khi chọn shop nguồn và bài đăng nguồn.
- Khung preview bên phải hiển thị trạng thái rõ: dữ liệu API đầy đủ hay chỉ local, số ảnh, video, ngành hàng, số thuộc tính, cân nặng/kích thước và cảnh báo phần còn thiếu trước khi tạo nháp.
- Khi đổi shop nguồn hoặc bài nguồn, form tự xóa dữ liệu cũ rồi nạp lại từ preview mới để tránh đăng nhầm media/thuộc tính của bài trước.

## Trạng thái vận hành

- Shop có API và đã đồng bộ catalog sâu: lấy dữ liệu từ `marketplace_product_knowledge`, dùng làm nguồn chính cho nháp đăng bài.
- Shop chưa có API hoặc chưa có knowledge snapshot: UI vẫn cho xem dữ liệu local nhưng cảnh báo thiếu media/thuộc tính để người vận hành đồng bộ hoặc nhập bổ sung.
- Shopee/Lazada/TikTok dùng chung core nháp; phần gửi thật lên sàn vẫn giữ ở trạng thái `draft_only`, chưa tự đăng thật nếu chưa qua guard riêng của từng sàn.

## Kiểm tra

- `node --check apps/worker-api/src/routes/products.js` pass.
- `node --check apps/fe/js/admin/var-actions.js` pass.
- `git diff --check` cho các file `products.js`, `var-actions.js`, `admin-products.html`, `admin.css` không có lỗi whitespace thật.
- Worker API production đang dùng bản đã deploy `9002de81-7c12-46b6-b2a1-d3dc721a3cb6`.
- Frontend production: `d443281a-81a3-4e72-9a8a-31591ec282a7`.
- API production `POST /api/products/publish-draft-preview` với Shopee `chihuy1984` trả `12` ảnh, `has_video=true`, ngành `101154`, `6` thuộc tính, `0.2kg`; chỉ còn cảnh báo thiếu kích thước vì nguồn trả `0x0x0`.
- Production UI mở thật `admin-products.html#variations`, tick SKU, mở `Đăng đa sàn`, chọn nguồn Shopee `chihuy1984`: form tự điền mô tả, ngành `101795`, thương hiệu, thuộc tính, `0.15kg`, URL video và danh sách ảnh; preview hiện `Dữ liệu API đầy đủ`, `Video đã lấy`.
- Đã bấm `Tạo bản nháp` trên production và kiểm D1 remote: bản nháp `#1` lưu `8` ảnh, có video, ngành `101795`, `3` thuộc tính, cân nặng `0.15`.

# 2026-05-09 - Tách lọc phí TTLK và giảm giá Shopee trong Số dư doanh thu

## Việc đã làm

- Backend thêm endpoint `GET /api/income/shopee/fee-discounts` để đọc dữ liệu thật đã lưu trong `order_fee_details`.
- Phí TTLK lấy trực tiếp từ cột `fee_affiliate`; giảm từ Shopee lấy trong raw escrow các field `voucher_from_shopee`, `shopee_discount`, `coins`.
- UI `Số dư doanh thu Shopee` thêm tab ngang `TTLK / giảm Shopee` với bộ lọc: có TTLK, có voucher Shopee, có Shopee discount, có coins, có giảm từ Shopee, hoặc tất cả escrow đã lưu.
- Bảng theo từng đơn hiển thị mã đơn, shop/khách, ngày đơn, doanh thu, phí TTLK, voucher shop, voucher Shopee, Shopee discount, coins và thực nhận.
- UI ghi rõ nguồn dữ liệu là API escrow thật đã lưu trong D1, không dùng `cost setting`.

## Trạng thái vận hành

- Shop Shopee có Payment API: lọc trực tiếp từ escrow detail đã đồng bộ bằng `shopee.payment.get_escrow_detail`.
- Shop Shopee chưa có Payment API hoặc chưa từng đồng bộ escrow detail: không tự tạo số fallback; cần đồng bộ Payment API hoặc import dữ liệu chính thức trước khi phân tích.
- Lazada/TikTok: chưa nhập chung vào tab này vì field TTLK/voucher Shopee là dữ liệu đặc thù Shopee Payment; finance của sàn khác vẫn đi theo tab riêng.

## Kiểm tra

- `node --check apps/worker-api/src/routes/income.js` pass.
- `node --check apps/fe/js/dashboard/income.js` pass.
- Worker API production: `3dfe4df6-20f6-4f35-855d-d1ad1ced79f9`.
- Frontend production: `78dbb67c-3774-4ebc-b57d-97e19a5b826e`.
- API production `filter=has_affiliate` trả `11` đơn có `fee_affiliate > 0`, tổng TTLK `41.920đ`.
- API production `filter=has_shopee_support` trả `187` đơn có hỗ trợ/giảm từ Shopee, tổng hỗ trợ Shopee `2.409.433đ`.
- Production UI mở thật `profit-dashboard.html#income`, bấm tab `TTLK / giảm Shopee` thấy bảng hiển thị `195 đơn · TTLK 41.920đ · Giảm Shopee 2.409.433đ · Trang 1/4`, các cột Voucher Shopee/Coins/Thực nhận lên đúng dữ liệu.

# 2026-05-09 - Chặn đơn pending quá cũ khỏi tab Chưa xử lý OMS

## Việc đã làm

- Thêm cửa sổ vận hành 30 ngày cho nhóm đơn `PENDING`/`LOGISTICS_PENDING_ARRANGE` trong API danh sách OMS để đơn cũ không bị kéo lại vào tab `Chưa xử lý`.
- Badge OMS dùng cùng logic này nên số lượng tab con không còn lệch với danh sách đang hiển thị.
- Không sửa hàng loạt trạng thái đơn cũ thành hoàn thành/hủy; đơn cũ vẫn tìm được bằng mã đơn, tracking hoặc khi lọc khoảng ngày rõ ràng.

## Trạng thái vận hành

- Shop có API: đơn pending mới vẫn hiện bình thường; dữ liệu cũ do API hoặc cleanup chạm lại sẽ không chiếm tab thao tác hiện tại nếu ngày đơn đã quá 30 ngày.
- Shop không có API/manual_reference: đơn tham chiếu cũ không còn bị tính là việc cần xử lý, nhưng vẫn giữ để đối soát và tìm kiếm.
- Cần tiếp tục kiểm tra riêng endpoint trạng thái Lazada nếu sàn vẫn trả trạng thái pending cho đơn lịch sử quá xa.

## Kiểm tra

- `node --check apps/worker-api/src/core/order-status-core.js` pass.
- `node --check apps/worker-api/src/routes/orders.js` pass.
- `node --check apps/worker-api/src/index.js` pass.
- Worker API production: `7765b4c1-1763-4481-8ca3-8fc5a6d97684`.
- API production `/api/orders?oms_status=PENDING&shipping_status=LOGISTICS_PENDING_ARRANGE` còn `3` đơn mới, không còn các mã cũ `504485805276701`, `250302J22HEYTE`, `250129RBG9287P`, `476104466469077`.
- API production cùng filter khi thêm `include_stale=1` vẫn trả `9` đơn và thấy đủ các mã cũ để đối soát.
- API production khi tìm `search=504485805276701` vẫn trả đúng đơn cũ.
- Production UI `oms-dashboard.html?v=pending-window-20260509` đã mở thật, bấm `Chờ Xử Lý`: badge con `Chưa Xử Lý` còn `3`, dòng tổng hiển thị `Tổng 3 đơn | Trang này: 3`, không còn các mã cũ trong ảnh.

# 2026-05-09 - Nối Shopee Media và MediaSpace vào Trung tâm video

## Việc đã làm

- Nối rõ nhóm endpoint Shopee `Media` đang dùng cho Shopee Video: `init_video_upload`, `upload_video_part`, `complete_video_upload`, `get_video_upload_result`, `cancel_video_upload`, `upload_image`.
- Nối thêm nhóm endpoint Shopee `MediaSpace` dùng shop token cho ảnh/video sản phẩm: `upload_image`, `init_video_upload`, `upload_video_part`, `complete_video_upload`, `get_video_upload_result`, `cancel_video_upload`.
- Backend có route kiểm capability `GET /api/video/shopee/media-endpoints` để xem shop nào đủ `Media` và `MediaSpace`.
- Backend có route upload MediaSpace tách riêng:
  - `POST /api/video/shopee/media-space/image-upload`
  - `POST /api/video/shopee/media-space/upload`
- Lệnh upload thật bị khóa bằng `confirm_upload = XAC_NHAN_UPLOAD_MEDIA_SHOPEE`; kiểm thử mặc định dùng `dry_run=1` để không tạo media thật trên Shopee.
- UI tab `Shop / API` trong Trung tâm video hiển thị KPI `Shopee Media`, `Shopee MediaSpace` và trạng thái từng shop `Media video: Đã nối`, `MediaSpace sản phẩm: Đã nối`.
- Trung tâm API nâng cao có module/permission matrix `Shopee Media và MediaSpace` để không bị hiểu nhầm là chỉ mới ghi chú tài liệu.

## Trạng thái vận hành

- Shop Shopee có API Video: upload/đăng Shopee Video tiếp tục đi qua endpoint `Media` public trước khi gọi `Video API`.
- Shop Shopee có API chính còn token: `MediaSpace` đã sẵn sàng cho module tạo/sửa sản phẩm cần ảnh/video sản phẩm; hiện vẫn phải qua route guard và preview payload riêng trước khi gửi thật.
- Shop Shopee không có API: không gọi `MediaSpace`; vẫn dùng luồng tham chiếu tay hoặc browser helper có log, không gắn nhãn đồng bộ API.
- Lazada/TikTok: không dùng endpoint Shopee, không bị ảnh hưởng bởi thay đổi này.

## Kiểm tra

- `node --check apps/worker-api/src/routes/video.js` pass.
- `node --check apps/fe/js/video-dashboard.js` pass.
- `node --check apps/worker-api/src/routes/api-features.js` pass.
- `node --check apps/worker-api/src/routes/api-modules.js` pass.
- Kiểm tra whitespace bằng `git diff --check` không báo lỗi trong workspace hiện tại.
- Quét mojibake cho cụm file vừa sửa không thấy `Ã`, `Â`, `áº`, `á»`, `ðŸ`, `â€¦`.
- Worker API production: `a9a3a38a-7528-4f94-87f6-1fd520a4ea3d`.
- Frontend production: `ba77cb00-a577-4e64-8f37-3bba55f8760f`.
- API production `GET /api/video/shopee/media-endpoints?shop=chihuy1984` trả `status=ok`, `media_video_ready=1`, `media_space_ready=1`, `media=connected`, `media_space=connected_with_guard`.
- API production `POST /api/video/shopee/media-space/upload` với `dry_run=1` trả đúng flow MediaSpace và không gửi file lên Shopee.
- API production `POST /api/video/shopee/media-space/image-upload` với `dry_run=1` trả đúng endpoint `/api/v2/media_space/upload_image` và không gửi file lên Shopee.
- API production `/api/advanced/features` và `/api/advanced/modules` đều có mục `shopee_media_endpoints`, trạng thái `module_ready_write_guard`.
- Production UI `dashboard_video.html?view=shop&v=shopee-media-20260509` đã mở bằng browser thật: tab `Shop / API` hiển thị `Shopee Media`, `Shopee MediaSpace`, `Media video: Đã nối`, `MediaSpace sản phẩm: Đã nối`; không bị chuyển về login.

# 2026-05-09 - TikTok tải lại tem sau khi nút In đổi hành vi

## Việc đã làm

- Sửa luồng TikTok tải lại tem để bấm nút `In giấy tờ` bằng click chuột thật thay vì chỉ dispatch event trong DOM; TikTok đổi component nên một số đơn có nút nhưng popup không mở ổn định.
- Chọn `Nhãn vận chuyển (A6)` chắc hơn bằng cả input thật, custom checkbox và bước chọn lại nếu nút `In` vẫn bị khóa.
- Khi một đơn bị lỗi popup, helper tự đóng popup trước khi xử lý đơn tiếp theo để không đọc nhầm các nút `Hủy`/`In` của modal cũ.
- Thêm fallback cho TikTok khi nút in không nằm trong dòng đơn: chọn dòng, mở trang `Nhãn vận chuyển`, tìm tem đã tạo và bấm `In` trong kho nhãn.
- Thêm lớp bắt PDF từ popup, iframe, response network hoặc download trực tiếp, vì TikTok có đơn mở popup chọn chứng từ nhưng có đơn lại chạy kiểu in trực tiếp.
- Restart Radar local sau khi sửa để process nền dùng module TikTok mới, tránh giữ cache Python cũ.

## Kiểm tra thực tế

- `python -m py_compile auto OMS Python/oms_python/platforms/tiktok/orders/tiktok_process.py` pass.
- Chạy Chrome thật bằng profile TikTok `0909128999`:
  - Đơn `583926465542653699`: đã chọn `Nhãn vận chuyển (A6)`, bấm `Tiếp tục in`, bắt PDF gốc `68.613` bytes, upload R2 thành `labels/583926465542653699.pdf`.
  - Đơn `583927560935409144`: đã chọn `Nhãn vận chuyển (A6)`, bấm `Tiếp tục in`, bắt PDF gốc `68.926` bytes, upload R2 thành `labels/583927560935409144.pdf`.
  - Đơn `583925370138231954`: hiện đã ở trạng thái TikTok `Đang trung chuyển`, không còn nút in trong dòng và không có trong trang `Nhãn vận chuyển` sau khi xóa filter; `/api/labels/status` vẫn `not_found`. Đây là trường hợp tem chưa được lưu trước khi bàn giao vận chuyển nên TikTok không trả lại file qua UI hiện tại.
- API production `/api/labels/status` đã xác nhận:
  - `583926465542653699`: `has_label=true`.
  - `583927560935409144`: `has_label=true`.
  - `583925370138231954`: `has_label=false`, `error=not_found`.

# 2026-05-09 - Nối rõ kho video Lazada vào Trung tâm video

## Việc đã làm

- Mở rộng tab `Lazada video` trong `dashboard_video.html`: ngoài quota/detail/upload đã có, UI nay có thêm `Kho video Lazada đã lưu`, tìm theo `video_id`/tiêu đề/trạng thái, chọn video, tra lại video đang chọn và xóa video có xác nhận.
- Backend `POST /api/video/lazada/remove` thêm `dry_run` để kiểm tra endpoint/xác thực shop trước khi gửi lệnh thật, đồng thời khi xóa thật sẽ đánh dấu cache D1 bằng `markMarketplaceVideosDeleted` để không làm mất caption cũ nếu video đã có trong kho.
- Ẩn khối điều khiển Shopee khi đang ở tab `Lazada video` hoặc `Shop / API`, tránh hiện trạng thái cache Shopee trên màn Lazada.
- Giữ đúng giới hạn vận hành: Lazada hiện chưa có endpoint list toàn bộ video đồng cấp Shopee trong bộ tài liệu đã rà, nên nút `Tải lại toàn bộ Lazada` chưa mở; kho Lazada đọc từ D1/R2 sau khi OMS upload hoặc tra theo `video_id` thật.

## Kiểm tra

- `node --check apps/fe/js/video-dashboard.js` pass.
- `node --check apps/worker-api/src/routes/video.js` pass.
- Quét nhanh mojibake cho các file vừa sửa không thấy `Ã`, `Â`, `áº`, `á»`, `ðŸ`, `â€¦`.
- Worker API production: `19099274-e37e-4d58-9ec2-0b6f0747d325`.
- Frontend production cuối: `7a569fed-a750-417e-95a9-7a2a5e5603a5`.
- API production:
  - `/api/video/capabilities` thấy shop Lazada `kinhdoanhonlinegiasoc@gmail.com` ở mode `lazada_media_api`, `video_ready=1`.
  - `/api/video/lazada/quota?shop=kinhdoanhonlinegiasoc%40gmail.com` trả `status=ok`, còn `39.374.989.335` bytes.
  - `/api/video/library?platform=lazada&shop=kinhdoanhonlinegiasoc%40gmail.com&list_type=all&limit=20` trả `0` dòng vì kho Lazada chưa có video được upload/tra bằng `video_id`.
  - `POST /api/video/lazada/remove` với `dry_run=1` trả `target.endpoint=/media/video/remove`; không xóa video thật.
- Production UI `dashboard_video.html?view=lazada&lazadaShop=kinhdoanhonlinegiasoc%40gmail.com&v=video-lazada-library-20260509b`:
  - Tab `Lazada video` hiện đúng shop `kinhdoanhonlinegiasoc@gmail.com - Lazada Media API sẵn sàng`.
  - Bấm `Đọc quota` hiển thị còn `37550.9 MB`, đã dùng `3409.1 MB`, tổng `40960.0 MB`.
  - Bấm `Đọc kho Lazada đã lưu` hiển thị `Đã đọc 0 video Lazada trong kho đã lưu` và thông báo chưa có video trong D1.
  - Không còn hiện khối `Bộ lọc và đồng bộ`/status cache Shopee trong tab Lazada.

# 2026-05-09 - Shopee Video tải lại toàn bộ thư viện và xóa video theo lô

## Việc đã làm

- Rà lại Shopee Video Open Platform: `/api/v2/video/get_video_list` giới hạn `page_size <= 20`, còn `/api/v2/video/delete_video` giới hạn tối đa `5` video/lần và chỉ được gửi một trong hai nhóm `post_id_list` hoặc `video_upload_id_list`.
- Sửa backend đồng bộ thư viện Shopee Video để có thể kéo theo từng cụm trang, không xóa cache D1 khi request mới chỉ quét được một phần danh sách.
- Thêm chế độ `library_only`, `start_page`, `list_scope` cho `/api/video/sync` để UI tải lại toàn bộ video theo nhiều request nhỏ, tránh lỗi Worker/Fetch khi shop có nhiều video.
- Mở rộng `/api/video/delete` để nhận nhiều video, chia lô đúng chuẩn 5 video/lần, bắt buộc xác nhận `XOA VIDEO`, có `dry_run`, ghi log và chỉ đánh dấu video đã xóa trong D1 khi Shopee trả thành công.
- Giao diện `dashboard_video.html` thêm bộ lọc tiêu đề lỗi “Bấm vào giỏ hàng để mua”, tìm kiếm, chọn danh sách đang lọc, bỏ chọn, xóa đã chọn và nút `Tải lại toàn bộ Shopee`.
- Sửa normalize tiếng Việt trong video dashboard để chữ `đ/Đ` được quy về `d`, nhờ đó bộ lọc tiêu đề có dấu nhận đúng dữ liệu thật.

## Trạng thái vận hành

- Shop Shopee có API Video: đọc thư viện bằng `/api/v2/video/get_video_list`, xóa thật bằng `/api/v2/video/delete_video` sau khi người vận hành chọn video và nhập xác nhận.
- Shop Shopee không có API Video: không chạy xóa/đồng bộ API, vẫn dùng luồng đăng tay hoặc browser helper có log.
- Lazada/TikTok: chưa có thay đổi trong phase này; không dùng endpoint Shopee cho các sàn khác.

## Kiểm tra

- Đã chạy `node --check` cho `apps/worker-api/src/routes/video.js`, `apps/worker-api/src/core/video-analytics-core.js`, `apps/fe/js/video-dashboard.js`.
- Đã deploy Worker API `8ce63495-be3d-45eb-8db6-af83b4d04fc2` và frontend `d3466b63-6066-4ad0-970e-8f2d83fca27e`.
- Đã mở production `dashboard_video.html?shop=chihuy1984&view=library`, bấm `Tải lại toàn bộ Shopee`: UI chạy theo cụm trang và báo `Đã lưu/cập nhật 315 dòng trên khoảng 308 video đã đăng`.
- Sau đồng bộ, production hiển thị `Video đã đăng (308/315)` và bộ lọc `Tiêu đề cần xóa (203)`; bật bộ lọc còn `203` video, không có lỗi console.
- Đã bấm `Chọn danh sách đang lọc` trước khi sửa tải theo cụm và xác nhận nút `Xóa đã chọn` bật đúng theo số video đã chọn; sau bản cuối đã xác nhận API `dry_run` `/api/video/delete` trả `OMS sẽ xóa 1 video Shopee nếu gửi lệnh thật`, còn request thiếu xác nhận trả HTTP `400` với thông báo cần nhập `XOA VIDEO`, không xóa video thật.

# 2026-05-09 - Lazada sửa endpoint tải tem sang PrintAWB

## Việc đã làm

- Rà lại luồng tải tem Lazada vì toàn bộ tem Lazada trong kho đang lỗi/not_found hoặc file bị che.
- Xác nhận endpoint cũ `/order/document/get` với `doc_type=shippingLabel` vẫn gọi được nhưng production trả `file` bị che/không hợp lệ, không đủ chuẩn để lưu tem thật.
- Đổi Worker API và helper Lazada local sang ưu tiên Fulfillment API `/order/package/document/get` (`PrintAWB`) với `getDocumentReq.doc_type=PDF` và danh sách `packages.package_id` lấy từ `/order/items/get`.
- Giữ `/order/document/get` làm fallback khi đơn không có `package_id`, đồng thời ghi lỗi rõ cả nhánh `package-document` và `order-document` nếu Lazada vẫn không trả file hợp lệ.
- Sửa kiểm R2 để khi mở/in lại tem không ghi đè `size_bytes=0`; kho tem sẽ giữ đúng dung lượng PDF sau khi check file thật.

## Kiểm tra

- `POST /api/label/524852422408031/refresh` trên production trước khi sửa trả lỗi `Lazada tra ve file tem dang bi che/khong hop le`.
- Sau deploy Worker `75e41146-48c8-45f0-afb8-dce605ea2a80`, cùng endpoint trả `status=ok`, lưu `labels/524852422408031.pdf`, `content_type=application/pdf`.
- `POST /api/label/524729216304224/refresh` cũng trả `status=ok`, lưu `labels/524729216304224.pdf`.
- `GET /api/label/524852422408031.pdf` trả HTTP 200, `application/pdf`, nội dung bắt đầu bằng `%PDF-`, dung lượng 389.037 bytes.
- `GET /api/labels/status?platform=lazada&status=all` trả Lazada `total=2`, `ok_labels=2`, `error_labels=0`; hai tem Lazada đều là PDF thật trong R2.
- Đã mở OMS production, vào `Kho tem in` -> `TÙY CHỈNH PHIẾU GIAO HÀNG` -> chọn `Lazada`; preview hiển thị iframe tem thật và dòng `Lazada · kinhdoanhonlinegiasoc@gmail.com · 524729216304224`.
- Đã chạy `node --check apps/worker-api/src/routes/labels.js` và `python -m py_compile auto OMS Python/oms_python/platforms/lazada/orders/lazada_process.py`.

# 2026-05-09 - Kho tem in preview bằng tem thật từ R2/D1

## Việc đã làm

- Đổi preview trong tab `TÙY CHỈNH PHIẾU GIAO HÀNG` từ mẫu vẽ mô phỏng sang dùng tem thật đã lưu trong `order_labels`/R2 theo từng sàn.
- Khi chọn Shopee/Lazada/TikTok, frontend gọi `/api/labels/status?platform=<sàn>&status=ok&limit=1` để lấy một tem hợp lệ gần nhất rồi nhúng trực tiếp `/api/label/{order_id}.pdf` hoặc `.html` vào khung preview.
- Sau khi kiểm thực tế phát hiện có dòng D1 cũ ghi OK nhưng file R2 mở lỗi, preview đã đổi sang lấy tối đa 12 tem gần nhất và thử mở file thật; chỉ tem trả HTTP 200 mới được dùng làm mẫu.
- Logo shop, REC nhắc quay video và hotline chỉ được chồng lên trên tem thật để người vận hành xem vị trí, không còn vẽ lại bố cục giả của sàn.
- Nếu sàn chưa có tem thật đã lưu, preview hiện thông báo rõ thay vì dựng tem giả.

## Kiểm tra

- API production ban đầu có record Lazada `524852422408031`, nhưng khi mở file thật thì R2 trả `not_found`; hệ thống đã ghi lại record này thành `Tem lỗi` và preview Lazada không dùng record hỏng làm mẫu nữa.
- Đã chạy `node --check` cho `oms-label-settings.js`, `oms-pdf.js`, `oms-main.js`.
- Đã deploy frontend production `3a8ece70-c70f-4777-a9ba-dc3caef1ec9a`, sau đó deploy bản kiểm file thật và cache-bust cuối `20e34476-45a9-4663-8bab-7aa6f76372d9`; bước mở OMS production kiểm UI thật được ghi trong phần xác nhận của lượt này.

# 2026-05-09 - Kho tem in bỏ badge chữ shop/sàn trên tem

## Việc đã làm

- Bỏ phần nhập `Tên shop/ký hiệu`, `Vị trí dấu chữ` và dòng cấu hình dấu riêng từng sàn trong tab `TÙY CHỈNH PHIẾU GIAO HÀNG`.
- Tắt hẳn `shopMarkEnabled` trong core cấu hình để dữ liệu cũ trong trình duyệt không tự bật lại badge chữ trên tem.
- Khi gộp/in PDF, hệ thống không còn vẽ badge chữ shop/sàn lên tem; vẫn giữ logo shop, dòng nhắc quay video và hotline vì đây là phần phục vụ khiếu nại.
- Đổi nhãn UI từ hướng `watermark/ký hiệu` sang `nội dung tem` để giao diện đỡ gây hiểu nhầm.

## Kiểm tra

- Đã chạy `node --check` cho `oms-label-settings.js`, `oms-pdf.js`, `oms-main.js`.
- Đã deploy frontend production `71017a1e-2866-4e25-afce-58b498ba4d1d`, sau đó deploy bản dọn code PDF cuối `f76b7921-2cb4-4513-a326-04a66ff93a96`.
- Đã mở OMS production `oms-dashboard.html?v=label-mark-clean-verify-20260509`, bấm `Kho tem in` -> `TÙY CHỈNH PHIẾU GIAO HÀNG`; UI không còn `Tên shop/ký hiệu`, `Vị trí dấu chữ` và dòng cấu hình dấu riêng từng sàn. Preview vẫn còn logo/REC/hotline, console không có lỗi JavaScript.

# 2026-05-09 - TikTok tải lại tem qua Radar không còn đọc sai job

## Việc đã làm

- Sửa `TikTokOrderProcessor` để đọc đúng job `refresh_label` dạng `{ order_ids, download_only }` từ Kho tem in/Radar, không còn nhầm các khóa `order_ids`, `download_only`, `source` thành mã đơn TikTok.
- Với lệnh `download_only`, TikTok chỉ tải lại và upload file tem vào R2 `labels/{order_id}.pdf`, không tự chuyển trạng thái OMS sang `Đã đóng gói`.
- Nếu đơn TikTok chưa có nút in trực tiếp, lệnh tải lại tem sẽ dừng và báo rõ không tự sắp xếp vận chuyển, tránh biến thao tác “tải lại tem” thành thao tác xử lý đơn thật.
- OMS chặn chuyển đơn TikTok sang `Đã đóng gói` khi chưa có tem R2; người vận hành phải bấm `Tải lại tem` trước, sau đó mới đánh dấu đóng gói.
- Trạm quay đóng gói cũng dùng cùng guard: đơn TikTok chưa có tem sẽ phát cảnh báo và không cho đi tiếp quy trình đóng gói.

## Trạng thái vận hành

- Shop TikTok không API: tải lại tem đi qua Chrome helper/Radar, đọc profile shop thật, lưu tem vào R2 nếu Seller Center trả PDF.
- Shop Shopee/Lazada có API: không đổi, vẫn ưu tiên endpoint sàn chính thức.
- Shop chưa API hoặc đơn chưa có tem: UI hiện rõ cần tải lại tem; không tạo tem giả và không tự đổi trạng thái.

## Kiểm tra

- Đã chạy `python -m py_compile` cho `tiktok_process.py`.
- Đã chạy `node --check` cho `oms-actions.js`, `oms-logistics-watch.js` và `worker-api/src/index.js`.
- Đã chạy trực tiếp Chrome thật với profile TikTok `0909128999`: bot bấm đúng dòng đơn `583937967333738299`, bấm `In giấy tờ`, chọn `Nhãn vận chuyển (A6)`, bấm `In`, bấm tiếp `Tiếp tục in`, bắt được PDF gốc `69072` bytes và upload thành công lên R2.
- Đã chạy lại qua Radar job production `refresh_label` cho đơn `583937967333738299`: job `431` hoàn tất, `/api/labels/status` trả `has_label=true`, `storage_key=labels/583937967333738299.pdf`, `refresh_mode=browser`.
- Đã mở OMS production, lọc đúng đơn `583937967333738299`, bấm `Tem` thấy `Tem hợp lệ` và file `labels/583937967333738299.pdf`; sau đó bấm `Đánh dấu đã đóng gói` thành công, drawer báo `Đã chuyển sang Đã đóng gói`, không còn lỗi thiếu tem.

# 2026-05-09 - Kho tem in tải lại tem theo API/browser và sửa lỗi font

## Việc đã làm

- Sửa modal `Kho tem in` theo hướng vận hành giống ShipXanh hơn: có `Chọn tất cả trang này`, `Chọn tem lỗi`, `Bỏ chọn`, `In lại tem đã chọn`, `Tải lại từ sàn`, `Tải lại tem lỗi trang này`, lọc theo mã đơn/shop/file và bấm Enter để áp filter.
- `/api/labels/status` trả thêm `platform`, `shop`, `api_connected`, `refresh_mode` để UI tách rõ `Tải bằng API sàn`, `Tải bằng Chrome helper`, `Cần nhập tay`.
- `Tải lại từ sàn` giờ tách luồng theo shop: shop Shopee/Lazada có API gọi `/api/label/{order_id}/refresh`; shop chưa API tạo job `refresh_label` cho Radar/Chrome local, không gắn nhãn đồng bộ API.
- Radar local và tab đồng bộ đơn đã bóc đúng response jobs dạng `value/data`, nhận được `refresh_label`, ghi file `temp_print_jobs_<shop>.json` theo shop và chạy `download_only` để chỉ tải lại tem, không tự chuyển trạng thái đơn sang `Đã đóng gói`.
- Luồng Shopee/Lazada `process` đã đọc payload `download_only`: bỏ qua `ship_order/order/pack`, upload lại PDF nếu tải được, giữ nguyên trạng thái đơn cũ.
- Worker `PATCH /api/jobs/:id` đã lưu được `error/message` vào `log_text` để job lỗi hiển thị lý do thay vì chỉ có trạng thái `failed`.
- Thêm timeout cho luồng Chrome no-API khi tải tem để job không treo vĩnh viễn nếu Seller Center không trả tem hoặc đơn quá cũ.
- Đã sửa lỗi font tiếng Việt bị mojibake do thao tác PowerShell trước đó, bump cache-bust `label-vault-shipxanh6-20260509` và ghi note vận hành: sửa file tiếng Việt bằng `apply_patch` hoặc PowerShell có `-Encoding UTF8`.
- Sửa 3 vùng thao tác trong tab `TÙY CHỈNH PHIẾU GIAO HÀNG`: công tắc `Đã bật/Đang tắt` là button thật, `+ Thêm mẫu` tạo dòng mẫu mới, và cả hàng mẫu có thể bấm để mở đúng phần chỉnh.

## Trạng thái vận hành

- Shop có API: tải lại tem đi qua endpoint sàn chính thức, file PDF lưu vào R2 `labels/{order_id}.pdf`, UI hiện `Tải bằng API sàn`.
- Shop không API: UI hiện `Tải bằng Chrome helper`, tạo job `refresh_label` để máy local mở Chrome profile shop; nếu sàn không trả PDF thì job fail có lý do, không còn treo `processing`.
- TikTok/chưa rõ endpoint: kho tem chỉ dùng tem đã lưu hoặc luồng helper/import; không tự tạo tem giả.

## Đã deploy và kiểm production thật

- Frontend production: `831522e1-2bbd-4c56-ad95-7417fd91697c`.
- Frontend production bổ sung thao tác mẫu tem: `8b79a8b5-787a-46c7-b98a-721f1dcaa357`.
- Worker API production: `f77c3efe-eee4-4e2e-8afc-fb3ef2e4080e`.
- Production OMS mở `oms-dashboard.html?v=label-vault-shipxanh6-verify-20260509`: các nhãn tiếng Việt trong main và modal `Kho tem in` hiển thị đúng dấu, không còn kiểu `In phiáº¿u sÃ n`.
- Modal production có đủ nút chọn hàng loạt, tải lại tem, tab `LỊCH SỬ IN`/`TÙY CHỈNH PHIẾU GIAO HÀNG`, và badge nguồn tải `Tải bằng API sàn`/`Tải bằng Chrome helper`.
- Lọc chính xác đơn `260401MH05JSEW` trong modal chỉ còn 1 dòng, hiển thị shop `phambich2312`, `refresh_mode=browser`, trạng thái `Tem lỗi`, đúng luồng shop không API.
- Tạo job kiểm thử no-API `refresh_label` cho `260401MH05JSEW`: Radar nhận job, mở Chrome profile shop, job kết thúc `failed` với lý do `Chưa lấy được tem PDF cho đơn: 260401MH05JSEW`; không còn kẹt `processing`.
- API production `GET /api/labels/status?order_id=260401MH05JSEW` xác nhận đơn chưa có tem R2, `api_connected=false`, `refresh_mode=browser`, lỗi hiện tại `missing_api_token`.
- Kiểm UTF-8 bằng Python `requests` xác nhận `log_text` từ API trả đúng tiếng Việt; PowerShell console có thể tự hiển thị mojibake nếu không ép UTF-8 nên không dùng làm nguồn xác nhận font cuối cùng.
- Production OMS mở `oms-dashboard.html?v=label-vault-template-actions-verify-20260509`: bấm công tắc đổi `Đã bật` sang `Đang tắt` rồi bật lại được; bấm `+ Thêm mẫu(watermark)` tạo thêm dòng `Mẫu watermark 2`; bấm hàng `Mẫu logo shop` mở đúng phần chọn logo; console không có lỗi JavaScript.

# 2026-05-09 - OMS cảnh báo khách hay hoàn/không nhận phase 1

## Việc đã làm

- Thêm core `customer-risk-core` để dựng hồ sơ khách có rủi ro từ lịch sử D1, dùng chung cho API danh sách đơn, bộ lọc OMS và badge cảnh báo trên từng dòng đơn.
- Thêm bảng `customer_risk_profiles` và `customer_risk_events` trong D1; phase 1 chỉ cảnh báo nội bộ, không tự chặn đơn, không tự hủy đơn và không gửi dữ liệu lên sàn.
- Thêm API:
  - `POST /api/customer-risk/rebuild` để dựng lại hồ sơ cảnh báo từ `orders_v2`.
  - `GET /api/customer-risk/profiles` để xem danh sách khách rủi ro.
  - `GET /api/customer-risk/events` để xem các đơn tạo ra cảnh báo.
- OMS thêm bộ lọc ngang `Khách: tất cả`, `Khách rủi ro`, `Rủi ro cao`, `Hay trả hàng`, `Hay không nhận`.
- Dòng đơn OMS hiển thị badge `Khách hay hoàn/không nhận` hoặc `Khách rủi ro cao` ngay trong cột `Shop / KH`, kèm tooltip tóm tắt tổng đơn, số đơn hoàn/trả, giao lỗi/không nhận và hủy.

## Phạm vi shop/sàn

- Shopee, Lazada, TikTok dùng chung dữ liệu đã lưu trong `orders_v2`; khách được gom theo `platform + shop + customer_name` trong phase 1 vì D1 hiện chưa có buyer id/phone chuẩn cho mọi sàn.
- Shop có API: sau `Quét trạng thái` hoặc đồng bộ API, OMS gọi thêm rebuild hồ sơ rủi ro để cảnh báo dựa trên dữ liệu mới nhất đã lưu.
- Shop không có API: dùng dữ liệu browser/import/manual đã lưu trong D1; UI chỉ ghi cảnh báo nội bộ, không gắn nhãn đồng bộ API cho shop chưa có token.

## Đã deploy và kiểm production thật

- Worker API production: `e2cd4b97-dd48-4d19-910f-52b770031cb3`.
- Frontend production sau fix render: `3984c816-73a6-4a74-8936-6b484c861298`.
- API production `POST /api/customer-risk/rebuild` trả `status=ok`, dựng `371` hồ sơ, trong đó `3` rủi ro cao, `7` trung bình, `124` theo dõi và `583` đơn có sự kiện rủi ro.
- API production `/api/orders?customer_risk=warning&page=1&limit=5` trả `25` đơn cảnh báo; `/api/orders?customer_risk=high&page=1&limit=3` trả `11` đơn rủi ro cao.
- Browser production mở `oms-dashboard.html?v=customer-risk-phase1-fix-20260509`: chọn `Khách rủi ro` thấy `Tổng 25 đơn | Trang này: 25`, các dòng có badge `Khách hay hoàn/không nhận`; chọn `Rủi ro cao` thấy `Tổng 11 đơn | Trang này: 11`, có `11` badge `Khách rủi ro cao`; console không có lỗi JavaScript.
- Trong lần kiểm đầu, production báo lỗi `renderCustomerRiskBadge is not defined`; đã sửa scope helper render, tăng cache-bust và deploy lại frontend trước khi xác nhận pass.

# 2026-05-09 - OMS đồng bộ trạng thái hoàn/trả hiện tại từ API sàn vào đơn hàng

## Việc đã làm

- Nối dữ liệu Shopee Returns và Lazada Reverse/Return sau khi sync về `orders_v2`, nên OMS không chỉ dựa vào snapshot cũ mà cập nhật lại trạng thái hoàn/trả hiện tại từ API sàn.
- Nút `Quét trạng thái` trong OMS sau khi cập nhật đơn thường sẽ gọi thêm luồng hoàn/trả: Shopee `/api/returns/shopee/sync`, Lazada `/api/returns/lazada/sync`.
- Mapping trạng thái hoàn/trả về đúng nhóm vận hành:
  - `RETURN_REFUND`: yêu cầu trả hàng/hoàn tiền đang mở hoặc đã có kết quả hoàn tiền.
  - `LOGISTICS_IN_RETURN`: đơn đang hoàn về shop.
  - `LOGISTICS_RETURNED_BY_SHIPPER`: shipper/sàn đã trả hàng về, chờ kho quét xác nhận.
  - `RETURN_COMPLAINT`: đơn đang tranh chấp/khiếu nại trên sàn.
  - `LOGISTICS_LOST` hoặc `FAILED_DELIVERY`: đơn lỗi/thất lạc/giao không thành công.
- Không tự chuyển sang `LOGISTICS_RETURN_PACKAGE_RECEIVED` từ API sàn; trạng thái `Đã nhận đơn hoàn` vẫn phải do kho quét mã nhận hoàn để tránh báo đã nhận khi hàng chưa vào shop.

## Phạm vi shop/sàn

- Shop có API Shopee/Lazada: cập nhật trạng thái từ endpoint chính thức của sàn và ghi ngược vào dòng đơn OMS.
- Shop không có API: không thể gọi API sàn, vẫn phải dùng quét trình duyệt/import file/manual scan; UI không gắn nhãn đồng bộ API cho shop chưa có token.

## Đã deploy và kiểm production thật

- Worker API production: `d7d7c160-f460-4a91-9dda-fce006087586`.
- Frontend production: `efa09cb1-8f7c-4639-b4c8-e4aea2599a00`.
- API production đã chạy thật:
  - `/api/returns/shopee/sync?hours=72&page_size=40&max_pages=2&include_detail=true` trả `status=ok`, `shop_count=2`, `orders_updated=0` vì không có return mới trong 72 giờ.
  - `/api/returns/lazada/sync?days=45&page_size=40&max_pages=1&include_detail=true&include_history=true&history_pages=1` trả `status=ok`, `shop_count=1`, `orders_updated=0` vì không có reverse mới trong 45 ngày.
  - `/api/orders/sync-api-orders` đã kéo lại trạng thái Shopee hiện tại: `READY_TO_SHIP 2`, `PROCESSED 16`, `SHIPPED 60`; `/api/orders/sync-api-status?limit=500` đối soát `50` đơn và cập nhật `20` dòng phí API.
- API production `/api/orders/badges?from=2026-04-10` sau đồng bộ trả `Hoàn Hàng = 46`, `Đang Khiếu Nại = 1`; các nhóm `LOGISTICS_IN_RETURN`, `LOGISTICS_RETURNED_BY_SHIPPER`, `LOGISTICS_RETURN_PACKAGE_RECEIVED` hiện `0` theo dữ liệu sàn trong cửa sổ này.
- Chrome production mở `oms-dashboard.html?v=return-status-sync-20260509`: bấm `Hoàn Hàng` và `Làm mới` thật, thấy bộ lọc `Hoàn: 30 ngày`, summary `Tổng 46 đơn | Trang này: 46`, dòng đơn có nhãn `Đang khiếu nại`, các nút `Quét hoàn`, `Nhận hoàn`, `Khiếu nại`; console không có lỗi JavaScript.

# 2026-05-09 - OMS làm gọn tab Hoàn Hàng theo phạm vi thời gian

## Việc đã làm

- Đổi tab `Hoàn Hàng` sang mặc định `Hoàn: 30 ngày` để màn hình vận hành chỉ hiện các đơn hoàn/trả còn cần kiểm gần đây, không trộn toàn bộ lịch sử D1.
- Thêm bộ chọn nhanh trong filter bar: `Hoàn: 7 ngày`, `Hoàn: 30 ngày`, `Hoàn: 45 ngày`, `Hoàn: tất cả lịch sử`.
- Danh sách đơn và badge tab con dùng chung tham số thời gian `from`, nên `Tất Cả`, `Yêu Cầu Trả Hàng`, `Đang Hoàn Về Shop`, `Shipper Đã Trả Hàng`, `Đã Nhận Đơn Hoàn`, `Đang Khiếu Nại`, `Thất Lạc` không còn lệch với bảng đang xem.
- Dữ liệu cũ không bị xóa; người vận hành vẫn chọn `Hoàn: tất cả lịch sử` khi cần đối soát lại các đơn hoàn cũ.

## Phạm vi shop/sàn

- Shop có API: đọc dữ liệu hoàn/trả đã đồng bộ trong `orders_v2`, badge và bảng dùng cùng bộ lọc thời gian.
- Shop không có API: vẫn dùng dữ liệu browser/import đã lưu trong D1; bộ lọc thời gian chỉ làm gọn màn hình, không gắn nhãn đồng bộ API.

## Đã deploy và kiểm production thật

- Worker API production: `1eef65ba-3e5b-4f37-ac29-dff2d6df4e23`.
- Frontend production: `b6bdda2e-e115-417c-8fe1-04dc9d4ac73e`.
- API production `/api/orders?oms_status=RETURN&from=2026-04-10` trả `47` đơn; không lọc `from` vẫn trả `254` đơn lịch sử.
- API production `/api/orders/badges?from=2026-04-10` trả badge `Hoàn Hàng = 47`.
- Chrome production mở `oms-dashboard.html?v=return-scope-20260509`: bấm `Hoàn Hàng` thấy bộ chọn `Hoàn: 30 ngày`, summary `Tổng 47 đơn | Trang này: 47`, pagination `Trang 1 / 1 — 47 đơn`, badge cha `Hoàn Hàng 47`.
- Tab con production trong phạm vi 30 ngày: `Tất Cả 47`, `Yêu Cầu Trả Hàng 17`, `Đang Hoàn Về Shop 6`, `Shipper Đã Trả Hàng 13`, `Đã Nhận Đơn Hoàn 11`, `Đang Khiếu Nại 1`, `Thất Lạc 0`.
- Đổi thử `Hoàn: tất cả lịch sử` trên production: summary về `Tổng 254 đơn`, pagination `Trang 1 / 2 — 254 đơn`; đổi lại `Hoàn: 30 ngày` trở về `47` đơn.

# 2026-05-09 - OMS gom đúng vòng đời đơn hoàn về shop

## Việc đã làm

- Sửa `/api/orders` khi lọc `oms_status=RETURN` để gom đúng theo vòng đời hoàn: `order_type=return`, `oms_status=RETURN` và các trạng thái phụ `RETURN_REFUND`, `RETURN`, `FAILED_DELIVERY`, `FAILED_DELIVERY_ATTEMPT`, `COMPLETED`, `LOGISTICS_IN_RETURN`, `LOGISTICS_RETURNED_BY_SHIPPER`, `LOGISTICS_RETURN_PACKAGE_RECEIVED`, `LOGISTICS_LOST`.
- Bổ sung `FAILED_DELIVERY_ATTEMPT` vào core trạng thái chung để đơn giao không thành công cũng được xếp vào nhóm hoàn/trả thay vì rơi khỏi tab.
- Đổi tab con `Hoàn Hàng` theo cách vận hành giống ShipXanh hơn: `Tất Cả`, `Yêu Cầu Trả Hàng`, `Đang Hoàn Về Shop`, `Shipper Đã Trả Hàng`, `Đã Nhận Đơn Hoàn`, `Đang Khiếu Nại`, `Thất Lạc`.
- Badge tab `Tất Cả` trong nhóm hoàn giờ hiện tổng của tab cha, không còn nhìn như `0`.

## Đã deploy và kiểm production thật

- Worker API production: `54b816a6-ae75-4902-9fcf-041059b05357`.
- Frontend production: `bc105921-5758-4ca5-8f4d-3a19181f2d46`.
- API production `/api/orders?oms_status=RETURN` trả `254` đơn, khớp badge `Hoàn Hàng`.
- API production các nhóm con trả đúng dữ liệu: `Yêu Cầu Trả Hàng 59`, `Đang Hoàn Về Shop 58`, `Shipper Đã Trả Hàng 70`, `Đã Nhận Đơn Hoàn 67`.
- Mở production `oms-dashboard.html?v=return-tabs2-20260509`: sidebar `Hoàn Hàng` hiện `254`; tab con hiển thị `Tất Cả 254`, `Yêu Cầu Trả Hàng 59`, `Đang Hoàn Về Shop 58`, `Shipper Đã Trả Hàng 70`, `Đã Nhận Đơn Hoàn 67`, `Đang Khiếu Nại 1`, `Thất Lạc 0`; console không có lỗi JavaScript.

# 2026-05-09 - OMS nút xử lý yêu cầu hủy ngay trên từng dòng đơn

## Việc đã làm

- Thêm nút `Đồng ý hủy` và `Từ chối hủy` trực tiếp trong dòng đơn có `shipping_status = IN_CANCEL`, đặt cạnh `Theo dõi`, `Tem`, `Video` để vận hành không phải nhớ tích checkbox rồi nhìn toolbar.
- Hai nút dòng dùng lại guard `/api/orders/buyer-cancellation/decide`: chỉ Shopee/Lazada được gửi lệnh thật, vẫn bắt confirm trước khi gọi API sàn.
- Chặn browser autofill ô tìm kiếm OMS thành tên tài khoản như `shopee_reviewer` sau refresh bằng `autocomplete=off`, tên input riêng, `readonly` đến khi người dùng bấm vào và clear giá trị trước lần tải đầu.

## Đã deploy và kiểm production thật

- Frontend production: `9d59f1df-2ebd-4c9f-9c08-9a340e2074ea`.
- Trước khi đơn `IN_CANCEL` biến mất do dữ liệu trạng thái mới, production đã mở được tab `Khách Yêu Cầu Hủy`, bảng có `1` dòng và dòng đó có đủ `Đồng ý hủy`, `Từ chối hủy`, `Theo dõi`, `Tem`, `Video`; không bấm gửi lệnh thật lên sàn.
- Sau deploy chặn autofill, refresh production không còn tự điền `shopee_reviewer` vào ô tìm kiếm; DOM chỉ còn placeholder `Tìm mã đơn, tên KH, SKU...` và console không có lỗi JavaScript.
- Tại thời điểm kiểm cuối, API production không còn đơn `IN_CANCEL` đang mở nên tab `Khách Yêu Cầu Hủy` về `0`; không tạo dữ liệu giả trên production.

# 2026-05-09 - OMS sửa lệch số lượng tab con Chờ Xử Lý

## Việc đã làm

- Sửa `/api/orders/badges` để đếm badge OMS theo cùng logic cha/con với `/api/orders`: một đơn có `shipping_status = LOGISTICS_REQUEST_CREATED` hoặc trạng thái con vẫn được tính đúng vào `PENDING` và tab con `Đã Xử Lý`.
- Frontend OMS đọc bộ đếm chuẩn `oms:<trạng thái>` thay vì tự cộng tay các mã con, tránh lệch giữa badge sidebar và `Tổng đơn` trong bảng.
- Đổi cache-bust module OMS sang `oms-badge-count-20260509` để production không giữ JS cũ.

## Đã deploy và kiểm production thật

- Worker API production: `6a9846ea-ea74-4ec6-96af-ed7fc6ced18c`.
- Frontend production: `eb7cd990-200e-45b7-8c05-d0eb4ce889ed`.
- Mở production `oms-dashboard.html?v=oms-badge-count-20260509`, reset filter rồi chọn `Chờ Xử Lý`: badge chính hiển thị `34`, các tab con là `Chưa Xử Lý 28`, `Đã Xử Lý 5`, `Đã Đóng Gói 0`, `Khách Yêu Cầu Hủy 1`, `Gói Sẵn Giao Nhanh 0`.
- Bấm tab con `Đã Xử Lý`: summary hiển thị `Tổng 5 đơn | Trang này: 5`, bảng render đủ `5` dòng và console không có lỗi JavaScript.

# 2026-05-09 - OMS đưa hành trình đơn hàng vào từng dòng đơn

## Việc đã làm

- Bỏ khung lớn `Theo dõi vận chuyển trực tiếp trên đơn hàng` khỏi đầu trang OMS vì hành trình phải nằm đúng ngữ cảnh từng đơn, không chiếm một mảng giao diện riêng.
- Chuyển thao tác logistics vào cột trạng thái của từng dòng: `Theo dõi`, `Tem`, `Video`, `Quét hoàn`, `Nhận hoàn`, `Khiếu nại` theo đúng loại đơn.
- Thêm drawer `Hành trình đơn hàng`: hiển thị sàn/shop, ĐVVC, mã vận đơn, trạng thái, timeline xử lý, nút kiểm tem, tìm video đóng gói và bằng chứng khiếu nại.
- Dọn module frontend `oms-logistics-watch.js`: chỉ còn xử lý drawer từng đơn, overlay quét mã hoàn và các thao tác đọc/ghi an toàn; không còn render bảng logistics tổng ở đầu trang.
- Dọn CSS logistics cũ của panel tổng; giữ lại CSS cần thiết cho badge từng dòng, drawer chi tiết và camera quét hoàn.
- Ghi note memory về quy chuẩn UI mới: chú thích dài ẩn sau biểu tượng, layout mobile-to-PC, nút rõ ngữ cảnh, tham chiếu ShipXanh và đưa phương án cho người dùng duyệt trước khi sửa giao diện lớn.

## Trạng thái vận hành

- Shop có API: hành trình trong drawer đọc dữ liệu đơn/tracking/status đã đồng bộ từ sàn làm nguồn chuẩn; các nút tem/video/khiếu nại dùng kho tem, kho video và guard returns hiện có.
- Shop không API: drawer chỉ là luồng kiểm tra nội bộ theo dữ liệu browser/import/D1, không gắn nhãn đồng bộ API.
- Quét hoàn: chỉ xác nhận hàng hoàn về shop trong OMS, không gửi thao tác lên sàn.

## Đã deploy và kiểm production thật

- Frontend production: `74b0e310-7f20-42e3-8dcc-e1e1b2dcdb30`.
- Production `oms-dashboard.html?v=logistics-row-drawer-20260509` đã mở được sau đăng nhập, không còn `#logisticsWatchPanel` và không còn tiêu đề `Theo dõi vận chuyển trực tiếp trên đơn hàng`.
- Bảng đơn production có `200` nút `Theo dõi` trên trang hiện tại; bấm dòng đầu mở drawer `Hành trình đơn hàng` đúng đơn `260509VRCWMQ6Y`, có timeline, ĐVVC, mã vận đơn/tracking và nhóm nút thao tác.
- Bấm `Kiểm tra tem` trong drawer production gọi được API thật và hiển thị kết quả trong drawer: tem chưa hợp lệ, chưa có file tem R2, chưa có video đóng gói, lỗi `not_found`.
- Bấm đóng drawer production xóa được panel khỏi DOM; console browser không có lỗi JavaScript.

# 2026-05-09 - Kho tem in, watermark và preview realtime

## Điều chỉnh lại giao diện theo tham chiếu ShipXanh

- Tách tab `Mẫu & watermark` thành kiểu `Tùy chỉnh phiếu giao hàng`: danh sách lớp cấu hình bên trái, panel chỉnh lớp đang chọn ở giữa và preview realtime lớn bên phải.
- Thêm các lớp cấu hình rõ ràng: `Khổ in & mã vận đơn`, `Dấu sàn / watermark`, `Logo shop`, `Ký hiệu quay video`.
- Thêm banner nhắc vận hành in qua OMS để lưu tem vào kho, gần giống luồng ShipXanh nhắc lưu/in lại tem theo thời gian.
- Preview tem có mã vận đơn phóng to, logo/dấu shop, watermark theo sàn, ký hiệu `REC`, nội dung nhắc khách quay video khi khui hàng và footer hotline.
- Phần cấu hình chỉ hiện các ô liên quan tới lớp đang chọn để giảm rối, thay vì dàn toàn bộ setting trên một màn hình.
- Cập nhật sau khi thao tác trực tiếp thêm nhiều mẫu ShipXanh: bánh xe là nút mở setting của từng lớp; nút `Lớp` chỉ dùng để nhân bản/làm việc với lớp. OMS đã đổi danh sách mẫu sang bảng giống ShipXanh, có cột bánh xe, tên mẫu, cột loại lớp, nút `Lớp`, sao chép/xóa và thời gian tạo.
- Panel setting lớp watermark đã bổ sung các tuỳ chọn giống mẫu ShipXanh: `Tên mặt hàng`, `Tên sản phẩm`, `SKU`, `Size`, `Hiển thị ghi chú của khách`, `Hiển thị ghi chú của người bán`, `Mã vận đơn`, `ID đơn hàng`. Preview được đổi sang khung phiếu thực tế có logo sàn, barcode, thông tin người gửi/người nhận, mã tuyến, QR, tiền thu hộ, tracking lớn và footer hotline.

## Đã deploy và kiểm production lại sau chỉnh giao diện ShipXanh

- Frontend production sau khi chỉnh sâu theo bánh xe setting và nhiều mẫu ShipXanh: `2f9ea1e6-35ab-4093-b4d3-77293a1b6f62`.
- Chrome production mở `oms-dashboard.html?v=label-vault-shipxanh3-20260509`: bấm `Kho tem in`, vào tab `TÙY CHỈNH PHIẾU GIAO HÀNG`, thấy modal `In phiếu sàn`, toggle `Đã bật`, nút `＋ Thêm mẫu(watermark)`, bảng mẫu có bánh xe setting và preview phiếu thực tế.
- Đã bấm thử tab Lazada trên production, preview đổi sang `Lazada LEX`, tracking `LMP0353769730VNA`; bấm bánh xe mẫu mở đúng panel chỉnh có các ô `Văn bản 2 / hotline` và không phát sinh lỗi JavaScript trong console.
- Frontend production: `3ebfb23c-f9a8-4eaa-b2bb-933fdc0c8604`.
- Chrome production mở `oms-dashboard.html?v=label-vault-shipxanh-20260509`: thấy nút `Kho tem in`, mở modal được và có banner nhắc in qua OMS để lưu tem.
- Tab `Mẫu & watermark` production có đủ cấu trúc mới: `Tùy chỉnh phiếu giao hàng`, bảng lớp `Khổ in & mã vận đơn`, `Dấu sàn / watermark`, `Logo shop`, `Ký hiệu quay video`.
- Preview realtime production có mã vận đơn lớn `SPXVN058799940701`, ký hiệu `REC`, tab sàn `Shopee/Lazada/TikTok`; chuyển sang Lazada preview hiển thị đúng watermark Lazada.
- Bấm qua lớp `Logo shop` và `Ký hiệu quay video` trên production thấy đúng panel chỉnh tương ứng, có input logo và biến chèn nhanh như `@tracking_number`.

## Việc đã làm

- Đổi nút `Cấu hình tem A6` trong OMS thành `Kho tem in` để gom phần tem đã lưu, tem lỗi, tải lại tem, in lại tem và mẫu/watermark vào một modal vận hành riêng.
- Thêm tab `Tem đã lưu`, `Tem lỗi`, `Tải lại / In lại`, `Mẫu & watermark`; giao diện dạng bảng gọn, font nhỏ hơn, có lọc theo sàn/shop/mã đơn và có thao tác hàng loạt.
- `/api/labels/status` hỗ trợ trả summary toàn kho, danh sách tem có filter `status`, `platform`, `q`, `limit`, `offset`; dữ liệu lấy từ `order_labels` để tránh đọc R2 hàng loạt.
- Tab mẫu có preview realtime theo từng sàn `Shopee`, `Lazada`, `TikTok`, chỉnh watermark, vị trí dấu, logo shop, kích thước logo, dòng nhắc khách quay video khi khui hàng và footer hotline.
- Luồng in lại trong kho dùng core gộp/in tem để áp lớp phụ: logo shop, watermark theo sàn, ký hiệu `REC` và câu nhắc quay video; mã vạch/QR gốc của sàn vẫn giữ nguyên trên file tem.

## Trạng thái vận hành

- Shop có API: tem tải từ endpoint sàn vẫn là nguồn gốc, kho tem chỉ lưu bản đã tải và lớp phụ để in lại/khiếu nại nhanh.
- Shop không API: tem chỉ có khi đã được browser/helper tải về hoặc import vào R2, UI hiển thị rõ tem lỗi để tải lại hoặc xử lý tay.
- TikTok hiện vẫn phụ thuộc nguồn tem đã lưu trong `order_labels`; nếu chưa có tem gốc thì kho chỉ báo lỗi/tải lại, không tự giả lập tem sàn.

## Đã deploy và kiểm production thật

- Worker API production: `7a83a372-27e0-46ad-8cba-95d3acead0b3`.
- Frontend production: `de6196b0-6b96-4f7f-bb65-37696d560e43`.
- Production `GET /api/labels/status?limit=5&status=all` trả summary thật: `141` tem, `86` tem OK, `55` tem lỗi; có đủ Shopee, Lazada, TikTok.
- Production `GET /api/labels/status?status=ok&platform=lazada` lọc được tem Lazada đã lưu dạng HTML: `524852422408031`.
- Chrome production mở `oms-dashboard.html?v=label-vault-20260509`: thấy nút `Kho tem in`, không còn nhãn cũ `Cấu hình tem A6`.
- Bấm `Kho tem in` trên production mở modal có đủ tab `Tem đã lưu`, `Tem lỗi`, `Tải lại / In lại`, `Mẫu & watermark`.
- Tab `Tem lỗi` hiển thị lỗi thật như `not_found` và lỗi giới hạn subrequest cũ để vận hành biết đơn nào cần tải lại.
- Tab `Mẫu & watermark` có preview realtime, mini-tab `Shopee/Lazada/TikTok`, input logo shop, ký hiệu `REC` và câu nhắc `Quay video khi khui hàng`.
- Bấm thử `Mở/In lại` một tem đã lưu trên production: core gộp/in trả toast `Đã gộp xong 1 phiếu PDF.`, không có lỗi tạo PDF.
- Đã xóa sạch tài khoản/session test tạm sau kiểm: `users_left=0`, `sessions_left=0`.

# 2026-05-09 - OMS quét camera xác nhận đơn hoàn về shop

## Việc đã làm

- Thêm nút `Quét QR code` trong panel `Theo dõi vận chuyển` của OMS để mở camera dạng mobile như màn hình quét mã.
- Camera ưu tiên đọc `QR_CODE`, `CODE_128`, `CODE_39`, `ITF`, `EAN_13`; QR dạng URL/query/JSON được rút về mã đơn, mã vận đơn hoặc mã hoàn sạch trước khi gửi API.
- Khi quét thành công, frontend tự gọi `/api/returns/receive-scan` với mã đã đọc để đánh dấu đơn là `LOGISTICS_RETURN_PACKAGE_RECEIVED`, ghi nhận đơn đã hoàn về shop và tiếp tục sẵn sàng quét mã kế tiếp.
- UI camera có tab ngữ cảnh `Đóng gói, Giao / Xem / Hoàn`, phần `Hoàn` đang active, có trạng thái thành công/lỗi ngay trên màn hình và phát giọng tiếng Việt nếu trình duyệt hỗ trợ.
- Luồng này chỉ xác nhận nhận hàng hoàn nội bộ trong OMS, không gửi thao tác lên sàn; dữ liệu vẫn dùng chung `orders_v2`, `return_receive_scans` và bằng chứng video/tem hiện có.

## Trạng thái vận hành

- Shop có API: đơn hoàn/trả vẫn được đồng bộ từ endpoint sàn vào OMS, thao tác quét camera chỉ là bước kho xác nhận hàng đã về shop.
- Shop không API: vẫn dùng mã đơn/mã vận đơn trong D1 hoặc dữ liệu import/browser; quét camera chỉ ghi nhận kho nội bộ, không gắn nhãn là API sàn.
- Nếu không mở được camera trên điện thoại, vận hành vẫn nhập mã vào ô quét và bấm `Xác nhận hoàn về kho`.

## Đã deploy và kiểm production thật

- Frontend production: `36975926-f340-4589-9382-b7b926660a76`.
- Production `POST /api/returns/receive-scan` đã kiểm bằng đơn test tạm `CODEX_RETURN_CAMERA_20260509` và mã vận đơn `CODEXTRACKRETURN20260509`: API trả `status=ok`, cập nhật `shipping_status=LOGISTICS_RETURN_PACKAGE_RECEIVED`, ghi `return_receive_scans` và trả bằng chứng hiện có.
- Chrome production mobile viewport mở `oms-dashboard.html?v=return-scan-camera-20260509`: thấy nút `Quét QR code`, CSS/JS đúng version mới và script ZXing đã tải.
- Bấm `Quét QR code` trên production mở overlay camera dạng mobile, có `video#returnScanVideo`, tab `Hoàn` active, đủ các tab `Đóng gói, Giao / Xem / Hoàn` và dòng hướng dẫn tự đánh dấu đơn đã hoàn về shop; môi trường kiểm không có camera vật lý nên UI chuyển đúng sang cảnh báo `Camera quét mã bị ngắt` thay vì treo.
- Đã xóa sạch dữ liệu test tạm sau kiểm: `orders_left=0`, `scans_left=0`, `sessions_left=0`, `users_left=0`.

# 2026-05-09 - Trạm quay đóng gói tự chốt đơn và ghi overlay mã vận đơn

## Việc đã làm

- Sửa `cctv_packing.html`: khi quét đơn/mã vận đơn hợp lệ, trạm phát giọng `Sẵn sàng`, báo đã quét thành công và bắt đầu quay.
- Khi đang quay mà quét mã vận đơn khác, trạm chốt video đơn cũ, phát giọng `Đã lưu, tiếp tục đơn mới`, rồi tự bắt đầu phiên quay mới.
- Đổi recorder sang canvas overlay: file video tải lên đã có sẵn `Ngày giờ quay` đủ ngày/tháng/năm giờ/phút/giây và `Mã vận đơn` đầy đủ, kèm mã đơn nếu map được.
- Metadata upload gửi thêm `tracking_number`, `scan_code`, `recorded_at`, `stopped_at` để backend/R2 có đủ dấu vết nếu cần đối soát sau.

## Đã deploy và kiểm production thật

- `node` parse inline script của `cctv_packing.html` pass.
- `git diff --check` cho `cctv_packing.html` và checklist pass, chỉ còn cảnh báo CRLF Windows.
- Frontend dry-run `npx wrangler deploy --dry-run` pass.
- Frontend production: `763c2b6f-bc47-40be-9011-06a8de7e0471`.
- Production asset `cctv_packing.html` có đủ `recording-canvas`, overlay `Ngày giờ quay`, `Mã vận đơn`, câu phát `Đã lưu, tiếp tục đơn mới`, metadata upload `tracking_number / recorded_at / stopped_at` và queue flow chốt đơn cũ.
- Chrome CDP mở production bằng session kiểm thử tạm quyền `warehouse`: trang thật vào được `Trạm Đóng Gói Thông Minh - OMS`, không bị `Không có quyền`, hiện khu `Cài đặt nhanh`, QR `STOP_PACKING`, canvas ghi hình ẩn và account widget quyền `Thủ kho`.
- Trên production, `formatPackingOverlayDate(new Date(2026, 4, 9, 12, 34, 56))` trả `09/05/2026 12:34:56`; QR URL có `tracking_number=VN2602180531235` rút đúng `scanCode=VN2602180531235`.
- Trên production, overlay rows trả đủ `Ngày giờ quay`, `Mã vận đơn: VN2602180531235`, `Mã đơn: 260508U2RSA9B6`, `Sàn/shop: shopee / chihuy2309`; flow queue có `pendingRecordingMeta` và `stoppedUploadMeta` để không lẫn video cũ/mới.
- Đã xóa session/user kiểm thử tạm khỏi D1 production sau khi kiểm: `sessions=0`, `users=0`.

# 2026-05-09 - Guard ADS chia tab con theo quy trình kiểm tra

## Việc đã làm

- Sửa `apps/fe/pages/ads.html`: trong page con `Guard ADS`, tách tiếp thành 4 tab con `Quy trình chuẩn`, `Shop / API`, `Preview thao tác`, `Log đối soát`.
- Thêm checklist thao tác chuẩn ngay trong UI: kéo snapshot ADS thật trước, kiểm shop có API hay không, nhập campaign/adgroup ID từ Ads API, preview payload rồi mới nhập xác nhận để đẩy thật.
- Thêm dải tóm tắt nhỏ cho Guard ADS: số shop API thật, shop tham chiếu, shop đang chọn và số log guard gần nhất.
- Sửa `apps/fe/js/dashboard/ads.js`: khi bấm Guard ADS từ dòng SKU/campaign sẽ tự mở tab `Preview thao tác`; sau preview giữ ở tab thao tác, sau apply thành công chuyển sang `Log đối soát`.

## Đã deploy và kiểm production thật

- Frontend production: `94ea5eda-3665-421c-8ebe-9155fe0f0946`.
- Production `ads.html#ads-guard` nạp đúng `ads.js?v=ads-guard-tabs-20260509`.
- Chrome CDP desktop xác nhận Guard ADS có 4 tab con, tab `Quy trình chuẩn` mở mặc định, tab `Preview thao tác` và `Log đối soát` chuyển panel đúng.
- Dải tóm tắt production trả `3 shop API`, `3 shop tham chiếu`, shop đang chọn `Lazada · API thật`, `14` log guard gần nhất.
- Chrome CDP mobile `390px` xác nhận body không tràn ngang, cụm tab con cuộn ngang riêng (`scrollWidth=550`, `clientWidth=356`) và active panel vẫn là `guide`.

## Trạng thái vận hành

- `Shop có API`: tiếp tục đi qua guard preview/apply chính thức; UI nói rõ endpoint, route, payload, request_id và điều kiện apply.
- `Shop không API`: vẫn chỉ là tham chiếu để thao tác tay trên Seller Center; không mở nút apply thật nếu backend không báo `supports_ads_guard_apply`.
- `Bị khóa an toàn`: không tự tắt/bật ADS chỉ vì KPI xấu; phải có snapshot ADS mới, đúng shop API, đúng campaign/adgroup ID, preview OK và câu xác nhận đúng.

# 2026-05-09 - Trạm quay đóng gói đọc số lượng sản phẩm

## Việc đã làm

- Mở rộng `/api/cctv/scan-order`: khi quét mã đơn hoặc mã vận đơn, API trả thêm `item_summary.total_qty`, `sku_count`, danh sách item rút gọn và `speech_text`.
- Sửa `cctv_packing.html`: khi quét mã vận đơn, trạm map về `order_id` thật trước khi lưu video, không lưu video dưới tracking number.
- Thêm phát giọng đọc tiếng Việt tại trạm quay: ví dụ `Đơn này có 3 sản phẩm, 2 mã hàng`.
- Thêm hiển thị và phát giọng đọc tương tự trong tab `Kho video đóng gói` của `dashboard_video.html`.
- Tối ưu luồng quét nhanh: trạm quay ưu tiên `QR_CODE` và barcode vận đơn `CODE_128`, tự rút mã đơn/mã vận đơn từ QR dạng URL, query string hoặc JSON trước khi gọi `/api/cctv/scan-order`.
- Backend `/api/cctv/scan-order` cũng chuẩn hóa QR/barcode thành `scan_code` và `scan_candidates`, nên nếu camera gửi nguyên payload QR dài vẫn tìm được đơn trong D1.
- Thêm khu `Cài đặt nhanh` trong `cctv_packing.html`: hiện luôn QR `STOP_PACKING`, có nút tải QR và nút `Tối màn hình`.
- Thêm chế độ tiết kiệm pin kiểu web: làm tối video/giao diện nhưng vẫn giữ camera chạy, đồng thời dùng Screen Wake Lock nếu trình duyệt hỗ trợ. UI ghi rõ khóa/tắt hẳn màn hình điện thoại sẽ làm trình duyệt dừng camera.

## Đã deploy và kiểm production thật

- Worker API production: `3b06604f-6ada-4254-b84c-3c4f62f57f37`.
- Frontend production: `a194e8a8-50c4-4a08-bf60-2ff42ad910a9`.
- Production `/api/cctv/scan-order?code=260502BGRMWSXH` trả `found=true`, `total_qty=20`, `sku_count=1`, `speech_text=Đơn này có 20 sản phẩm`.
- Production quét bằng mã vận đơn `VN2602180531235` map về đơn `260508U2RSA9B6`, trả `total_qty=3`, `speech_text=Đơn này có 3 sản phẩm`.
- Production quét QR URL/JSON có `tracking_number=VN2602180531235` đều trả `scan_code=VN2602180531235`, map đúng đơn `260508U2RSA9B6`.
- Chrome production mở `cctv_packing.html` xác nhận chỉ còn 1 handler `onScanSuccess`, có `buildPackingScannerHints`, có `CODE_128` và QR URL được rút về mã vận đơn trước khi gọi API.
- Chrome production mở `cctv_packing.html` xác nhận có `packingQuantitySpeech`, có `speechSynthesis`, câu test trả `Đơn này có 3 sản phẩm, 2 mã hàng.`
- Chrome production mở `cctv_packing.html` xác nhận khu `Cài đặt nhanh` hiển thị QR SVG `STOP_PACKING`, nút `Tải QR`, nút `Tối màn hình` và ghi chú giới hạn khi khóa/tắt hẳn màn hình điện thoại.
- Chrome production gọi `toggleBatterySaver()` xác nhận body có class `power-save`, nút đổi sang `Mở sáng lại`; `normalizePackingScan('STOP_PACKING')` trả đúng `code=STOP_PACKING`.

## Trạng thái vận hành

- Shop có API và shop không API đều dùng chung dữ liệu D1 `orders_v2 + order_items` để đọc số lượng; không gọi thêm endpoint sàn khi đang quay.
- Nếu OMS chưa có item của đơn, trạm sẽ đọc `Đơn này chưa có dữ liệu sản phẩm` để nhân viên biết cần đồng bộ/import lại trước khi đóng gói.

## 2026-05-08 - Hoàn hàng, video bằng chứng và khiếu nại hoàn/trả

### Việc đã làm

- Mở rộng panel `Theo dõi vận chuyển` trên OMS để tách riêng `Đang hoàn về shop`, `Chờ quét nhận hoàn`, `Đã nhận hoàn` và `Đang khiếu nại`.
- Thêm luồng quét nhận hoàn nội bộ: quét mã đơn hoặc mã vận đơn sẽ xác nhận hàng hoàn đã về kho, ghi `return_received_at/by/note` và không tự gửi lệnh lên sàn.
- Thêm API `/api/cctv/scan-order` để kiểm tra đồng thời đơn OMS, tem tải về trong R2 và video đóng gói gần nhất.
- Thêm bộ bằng chứng khiếu nại hoàn/trả: API trả video đóng gói, link tải video, trạng thái tem, mã return/reverse nếu đã đồng bộ từ sàn.
- Thêm hồ sơ khiếu nại `/api/returns/complaints`: lưu trạng thái `needs_evidence / ready_to_send / marketplace_processing / manual_required / marketplace_replied / error`.
- OMS tab Hoàn hàng có tab con `Đang Khiếu Nại`; dòng đơn hoàn/trả có nút `Khiếu nại hoàn/trả` và `Cập nhật`.
- Shopee có API: nút khiếu nại dùng endpoint chính thức `/api/v2/returns/upload_proof` để gửi URL video đóng gói lên phần chứng cứ, sau đó hồ sơ chuyển `Sàn đang xử lý`.
- Lazada/shop không API: tạo hồ sơ khiếu nại nội bộ và link video để vận hành thao tác tay; chưa giả lập là đã gửi API nếu chưa nối endpoint upload chứng cứ chính thức.

### Đã deploy và kiểm production thật

- Worker API production: `c0546897-4da6-4884-8c2e-5cac40232f7c`.
- Frontend production: `87a8995d-8da1-4685-823b-7047bec2306c`.
- API production đã kiểm bằng đơn test an toàn `CODEXRET20260508A01`: `/api/cctv/scan-order` trả `found=true`, tem PDF hợp lệ, có video đóng gói và `complaint_ready=true`.
- API production `POST /api/returns/receive-scan` đã quét nhận hoàn về kho, cập nhật `LOGISTICS_RETURN_PACKAGE_RECEIVED` và ghi lịch sử scan nhận hoàn.
- API production `POST /api/returns/complaints/start` với `confirm_action=true` đã tạo hồ sơ `manual_required`; do đơn test không có `return_sn` thật nên hệ thống chặn gửi lên Shopee và báo cần đồng bộ Returns trước. Đây là guard đúng để không nộp khiếu nại giả lên sàn.
- API production `/api/logistics-watch?filter=return_complaint` và `/api/orders?order_type=return&shipping_status=RETURN_COMPLAINT` đều trả đúng đơn test trong nhóm `Đang khiếu nại`.
- Chrome production mở `oms-dashboard.html`: tab `Hoàn Hàng` có tab con `Đang Khiếu Nại`, panel logistics có thẻ `Đang khiếu nại`, ô quét mã hoàn và các nút `Xác nhận hoàn về kho`, `Kiểm tra tem`, `Tìm video đóng gói`, `Bằng chứng khiếu nại`, `Gửi khiếu nại`.
- Chrome production mobile `390x844`: tab con và thẻ đơn hiển thị gọn, dòng đơn có nhãn `Đã nhận hoàn`, `Đang khiếu nại`, nút `Khiếu nại hoàn/trả`, `Cập nhật`, không bị buộc kéo qua Trung tâm API.
- Chrome production `dashboard_video.html` tab `Kho video đóng gói`: nhập mã test và bấm `Kiểm tra mã đóng gói` thấy `Tem: hợp lệ`, `Video: đã có`, `Khiếu nại hoàn/trả: có video để tải lên sàn`, có nút `Tải video khiếu nại` và `Mở tem`.
- Ảnh kiểm: `artifacts/return-complaint-oms-desktop.png`, `artifacts/return-complaint-oms-mobile.png`, `artifacts/return-complaint-video-packing.png`.

### Trạng thái vận hành

- `Shop có API Shopee`: tự gom video đóng gói và gửi chứng cứ qua `upload_proof` khi có `return_sn`, video đã lưu và người vận hành bấm xác nhận.
- `Shop có API Lazada`: hiện mới đọc reverse/return và tạo hồ sơ/link video; bước upload chứng cứ tự động còn bị khóa tới khi nối đúng endpoint/media flow.
- `Shop không có API`: dùng hồ sơ nội bộ, link video/tem và trạng thái thao tác tay; không gắn nhãn đã gửi sàn.
- `Bị khóa an toàn`: chưa tự chọn lý do dispute, chưa tự gọi Shopee `dispute` nếu chưa có email/lý do hợp lệ, chưa tự phản hồi hàng loạt.

## 2026-05-08 - Logistics trực tiếp trên OMS đơn hàng

### Việc đã làm

- Rà endpoint Logistics Shopee/Lazada và chốt hướng vận hành: phần theo dõi phải nằm trực tiếp trong trang Đơn hàng, không đặt trong Trung tâm API.
- Thêm core `logistics-watch-core` và API đọc-only `/api/logistics-watch` để gom đơn thiếu tracking, đã đóng gói, chờ lấy hàng, giao lỗi và hoàn/trả.
- Thêm bộ lọc `logistics_watch` cho `/api/orders`; bấm từng thẻ trong panel logistics sẽ lọc thẳng bảng đơn hàng đang xử lý.
- Thêm panel `Theo dõi vận chuyển trực tiếp trên đơn hàng` trong `oms-dashboard.html`, có thẻ số liệu ngang, danh sách shop cần rà và danh sách đơn gần nhất.
- Thêm nhãn nhỏ trên từng dòng đơn: `Thiếu tracking`, `Đã đóng gói`, `Giao lỗi`, `Hoàn/trả` để vận hành nhìn vấn đề ngay trên bảng đơn.
- Giữ tách rõ shop có API và shop không API: shop API ưu tiên đọc tracking/trace/AWB; shop không API chỉ là tham chiếu để quét trình duyệt, import file hoặc thao tác tay.

### Đã deploy và kiểm production thật

- Worker API production: `cffc3afe-17ab-4163-b190-12b4a604574e`.
- Frontend production: `3def9ce3-e8e9-49f0-9c1a-c4b6d4c81940`.
- API production `/api/logistics-watch?limit=5` trả `6.193` đơn cần rà logistics, gồm `6.089` đơn thiếu tracking, `52` đơn đã đóng gói, `22` đơn chờ lấy hàng, `68` đơn giao lỗi, `157` đơn hoàn/trả; có `4.987` đơn shop API và `1.206` đơn shop không API.
- API production `/api/orders?logistics_watch=missing_tracking` và `/api/logistics-watch?filter=missing_tracking` cùng trả `6.089` đơn; `/api/orders?logistics_watch=packaged` và `/api/logistics-watch?filter=packaged` cùng trả `52` đơn, xác nhận số panel và bảng đơn đã khớp.
- Chrome production mở `oms-dashboard.html`: thấy panel logistics nằm ngay trên bảng đơn, bấm thẻ `Đã đóng gói` lọc bảng còn `52` đơn, thẻ active đúng và dòng đơn có nhãn `Thiếu tracking` / `Đã đóng gói`.
- Kiểm mobile viewport `390x844`: panel hiển thị gọn theo hàng ngang cuộn được, danh sách shop/đơn nằm trực tiếp trên trang OMS, không phải mở Trung tâm API.
- Ảnh kiểm: `artifacts/oms-logistics-watch-desktop.png`, `artifacts/oms-logistics-watch-mobile.png`.
- Đã xóa user/session manager tạm dùng để kiểm production khỏi D1, xác nhận `sessions=0`, `users=0`.

### Trạng thái vận hành

- `Shop có API`: theo dõi trực tiếp trên OMS, có thể ưu tiên bước tiếp theo là đọc tracking/trace/AWB theo sàn.
- `Shop không có API`: panel chỉ đánh dấu vấn đề để vận hành xử lý bằng quét trình duyệt, import file hoặc thao tác tay; không gắn nhãn đồng bộ API.
- `Bị khóa an toàn`: chưa mở EPIS Lazada consign/RTS/cancel, chưa đổi kênh vận chuyển, chưa pause logistics, chưa ship thật hàng loạt nếu chưa có preview, quyền admin và log riêng.
- `Bước tiếp theo`: tách `shipment_core`, nối Shopee batch tem/job + FirstMile, và mở Lazada trace + AWB/document read-only trước khi xét thao tác ghi.

## 2026-05-08 - Order API phase 2 thao tác có guard

### Việc đã làm

- Thêm workspace `Order API phase 2` trong Trung tâm API nâng cao để tách riêng nhóm thao tác sau đồng bộ: đơn có thể dry-run ship, đơn hủy cần chọn hướng, đơn thiếu tracking và shop không API.
- Thêm module `Order API phase 2` với action `Preview dry-run phase 2`.
- Action `preview_order_phase2` chỉ tạo payload dry-run cho Shopee `ship_order` và `mass_ship_order`; response luôn ghi `dry_run=true`, `sent_to_shopee=false` nếu chưa có `execute=true` và chuỗi xác nhận riêng.
- Không preview hàng loạt `ACCEPT/REJECT` cho đơn `IN_CANCEL`: hủy đơn vẫn phải đi qua guard OMS để người vận hành chọn `Đồng ý hủy` hoặc `Từ chối hủy`.
- Lazada và shop không API được tách rõ: phase 2 hiện chỉ đọc/đối soát, chưa gắn lệnh ghi thật nếu chưa có guard/payload chính thức.

### Đã deploy và kiểm production thật

- Worker API production: `92ef364f-5a9e-4293-91ce-fb500da59ab6`.
- Frontend production: `782dd0fc-5dfa-4141-884c-47d7447da843`.
- API production `GET /api/advanced/modules` đã có workspace/module `order_phase2`, trả `255` đơn cần guard: `13` đơn sẵn sàng dry-run ship, `1` đơn hủy cần chọn hướng, `63` đơn thiếu tracking API và `149` đơn shop không API.
- API production `POST /api/advanced/modules/actions` với `action=preview_order_phase2`, `platform=shopee`, `shop=chihuy2309`, `limit=20` trả `dry_run=true`, `sent_to_shopee=false`, tạo preview cho `ship_order` và `mass_ship_order` nhưng không gửi thao tác ghi thật lên Shopee.
- Chrome CDP mở production `oms-dashboard.html#api-advanced`: thấy workspace `Order API phase 2`, nút `Preview dry-run phase 2`, metric `Sẵn sàng dry-run ship`, `Hủy cần chọn hướng`, `Shop không API`, và nội dung `thao tác có guard`; không có lỗi JS.
- Đã bấm nút preview trên UI production và xác nhận request đi đúng `/api/advanced/modules/actions` với `action=preview_order_phase2`; sau kiểm đã xóa user/session manager tạm khỏi D1 production.

### Trạng thái vận hành

- `Shop có API`: Shopee có thể preview payload `ship_order/mass_ship_order`; gửi thật vẫn khóa bởi guard `execute=true` và chuỗi xác nhận riêng trong backend.
- `Shop không có API`: chỉ hiển thị để vận hành biết cần xử lý bằng quét trình duyệt, import file hoặc thao tác tay; không chạy API write.
- `Lazada`: đang ở trạng thái đọc/đối soát trong phase 2; chưa mở lệnh ghi thật cho logistics/order nếu chưa có guard riêng và payload chính thức.
- `Bị khóa an toàn`: không tự accept/reject hủy hàng loạt, không tự ship hàng loạt, không tự đổi kho/lịch lấy hàng.

## 2026-05-08 - Order API phase 1 trong Trung tâm API

### Việc đã làm

- Thêm workspace `Order API phase 1` trong Trung tâm API nâng cao để gom riêng các đơn Shopee/Lazada cần theo dõi: khách yêu cầu hủy, đã đóng gói, thiếu tracking, hoàn/trả hoặc giao thất bại.
- Workspace tách rõ shop `có API` và `không có API` dựa trên capability core, tránh nhầm lẫn giữa đồng bộ API thật và dữ liệu tham chiếu/manual.
- Thêm nút `Làm mới order phase 1`: chỉ đồng bộ đơn, tracking và trạng thái mới; không gửi lệnh ghi thật như xác nhận hủy hay ship hàng.
- Thêm link `Xem khu order phase 1` để nhảy thẳng tới nhóm dữ liệu order, giảm việc phải kéo dài trong Trung tâm API.

### Đã deploy và kiểm production thật

- Worker API production: `39367d35-cbb3-40f9-b571-415ba5141a3a`.
- Frontend production: `2e83bdfa-116d-42da-b67c-80a4d67422ad`.
- API production `GET /api/advanced/modules` đã có workspace/module `order_phase1`, trả `245` đơn cần theo dõi sau khi đồng bộ kiểm thử, gồm `1` đơn khách yêu cầu hủy, `52` đơn đã đóng gói và `21` đơn thiếu tracking.
- Action production `POST /api/advanced/modules/actions` với `action=refresh_order_phase1`, `platform=shopee`, `shop=chihuy2309`, `limit=3` đã chạy thành công: kéo `3` đơn, lưu `3` item, cập nhật phí cho `3` đơn; ghi chú trả về đúng rằng phase 1 chỉ đồng bộ dữ liệu và cập nhật trạng thái.
- Chrome CDP mở production `oms-dashboard.html#api-advanced` bằng phiên manager tạm: modal Trung tâm API mở được, có workspace `Order API phase 1`, nút `Làm mới order phase 1`, link `Xem khu order phase 1`, nhãn `Có API/Không API`, metric `Khách yêu cầu hủy` và `Đã đóng gói`; không có lỗi JS.
- Sau kiểm đã xóa user/session manager tạm khỏi D1 production, xác nhận `sessions=0` và `users=0`.

### Trạng thái vận hành

- `Shop có API`: dùng `refresh_order_phase1` để kéo lại đơn/trạng thái/tracking từ API, sau đó OMS đọc lại cùng core trạng thái đơn hàng.
- `Shop không có API`: workspace vẫn hiển thị dữ liệu tồn trong OMS nhưng gắn nhãn tham chiếu; vận hành dùng quét trình duyệt/import file/thao tác tay, không ghi là đồng bộ API.
- `Bị khóa an toàn`: phase 1 chỉ đọc và đồng bộ dữ liệu. Các lệnh ghi thật như chấp nhận/từ chối hủy, giao hàng, tách đơn vẫn nằm ở guard riêng và cần xác nhận rõ.

## 2026-05-08 - Xác nhận đơn đã đóng gói khi khách yêu cầu hủy

### Việc đã làm

- Rà endpoint chính thức cho luồng khách yêu cầu hủy sau khi đơn đã xử lý: Shopee dùng `POST /api/v2/order/handle_buyer_cancellation` với `operation=ACCEPT/REJECT`; Lazada dùng `/order/reverse/cancel/seller/decide` với `reverse_order_id` và `agree_cancel`.
- Tách trạng thái Shopee `IN_CANCEL` khỏi nhóm `CANCELLED`: OMS giữ đơn ở `PENDING / IN_CANCEL`, nhãn tiếng Việt là `Khách yêu cầu hủy`, chưa tính là đơn hủy thật cho tới khi người bán xác nhận.
- Thêm route production `POST /api/orders/buyer-cancellation/decide` để xác nhận `Đồng ý hủy` hoặc `Từ chối hủy`; route luôn dry-run nếu thiếu `confirm_action=true`, và chặn gửi thật nếu OMS không tìm thấy đơn đang ở `IN_CANCEL`.
- OMS thêm tab con `Khách Yêu Cầu Hủy` trong nhóm `Chờ Xử Lý`, thêm hai nút `Đồng ý hủy` và `Từ chối hủy`; nút chỉ bật khi toàn bộ đơn đang chọn có `shipping_status=IN_CANCEL`.
- Nút `Quét trạng thái` và cron API đã kéo thêm trạng thái `IN_CANCEL` để đơn khách yêu cầu hủy tự nhảy vào đúng tab thay vì nằm lẫn trong `Đã đóng gói` hoặc `Đã hủy`.
- Bổ sung guard read-only cho reviewer: hai nút xác nhận hủy và hàm `decideBuyerCancellation` bị khóa, tránh tài khoản kiểm tra gửi lệnh ghi thật lên sàn.

### Đã deploy và kiểm production thật

- Worker API production: `61effe64-fe5b-495a-aee8-32be12ef105f`.
- Frontend production: `e6b22ba3-f547-44d3-8d2f-e1d4158b0856`.
- API guard production đã kiểm bằng `POST /api/orders/buyer-cancellation/decide`: thiếu `confirm_action` trả `409 blocked` ở chế độ dry-run, `sent_to_shopee=false`; có `confirm_action=true` nhưng OMS không có đơn `IN_CANCEL` cũng bị chặn, `sent_to_shopee=false`.
- Chrome CDP mở production `oms-dashboard.html`, dùng phiên reviewer tạm: trang OMS tải được `204` dòng DOM/bảng, tab con `Khách Yêu Cầu Hủy` xuất hiện dưới `Chờ Xử Lý`, hai nút `Đồng ý hủy` / `Từ chối hủy` hiển thị trên toolbar và bị khóa đúng với reviewer.
- Sau kiểm đã xóa user/session reviewer tạm khỏi D1 production và xóa profile Chrome kiểm thử local.

### Trạng thái vận hành

- `Shop có API`: Shopee xác nhận bằng endpoint chính thức `handle_buyer_cancellation`; Lazada dùng endpoint seller decide nếu đã có `reverse_order_id` từ ledger reverse/cancel.
- `Shop không có API`: OMS vẫn hiển thị trạng thái để vận hành biết đơn đang chờ xác nhận, nhưng không gắn nhãn đồng bộ API; người vận hành xử lý tay trên Seller Center và ghi lại bằng luồng trạng thái OMS.
- `Bị khóa an toàn`: chưa tự động accept/reject hàng loạt; thao tác ghi thật bắt buộc chọn đơn `IN_CANCEL`, bấm nút rõ ràng và gửi `confirm_action=true`.
- `TikTok`: chưa có endpoint buyer-cancellation chính thức trong phase này, nên OMS chặn và báo xử lý tay thay vì giả lập API.

## 2026-05-08 - Sửa luồng OMS tồn ở Đã đóng gói

### Việc đã làm

- Kiểm production D1: còn `53` đơn Shopee ở `PENDING / LOGISTICS_PACKAGED`; trong đó `46` đơn thuộc `phambich2312` và `4` đơn thuộc `khogiadungcona` đang là `manual_reference`, không có API chính thức để tự kéo hành trình.
- Chạy thử sync trạng thái Shopee API cho `phambich2312`: `checked = 0`, vì shop này không nằm trong nhóm shop API; nguyên nhân kẹt không phải endpoint lỗi mà là thiếu bước xác nhận tay sau đóng gói.
- Bổ sung nút `Bàn giao ĐVVC` trên OMS để chuyển các đơn đã giao cho bưu tá từ `Đã đóng gói` sang `Đang giao`.
- Thêm guard frontend: không cho bàn giao nhầm đơn đã hủy, hoàn hoặc đã giao.
- Khôi phục đúng hướng tự động của nút `Quét trạng thái`: khi browser/API đọc được trạng thái `đã giao cho vận chuyển`, `đã vận chuyển`, `đang giao`, `shipped` thì core import tự chuyển sang `SHIPPING / SHIPPED`; nút `Bàn giao ĐVVC` chỉ là fallback tay.
- Cache-bust `oms-main.js`, `oms-actions.js` và `auth-guard.js` để production nhận đúng luồng mới.

### Trạng thái vận hành

- `Shop có API`: vẫn ưu tiên `sync-api-status` để đối soát lại trạng thái sàn; nếu API trả `SHIPPED/COMPLETED` thì core cập nhật theo dữ liệu sàn.
- `Shop không có API`: bấm `Quét trạng thái` để Radar Chrome đọc lại các tab sàn; nếu sàn đã đưa đơn sang nhóm đang giao thì OMS tự nhảy sang `Đang giao`. Chỉ dùng `Bàn giao ĐVVC` khi cần xác nhận tay vì không quét được trạng thái từ sàn.
- `Không tự sửa dữ liệu cũ hàng loạt`: các đơn đang tồn ở `Đã đóng gói` chưa bị chuyển trạng thái tự động vì cần xác nhận đã bàn giao thật.

## 2026-05-08 - Sửa chat mobile tự thoát hội thoại và chèn tin từ đơn hàng

### Việc đã làm

- Sửa polling danh sách chat trên mobile để không render rỗng thread đang mở; khi CSKH đang đọc một hội thoại, lần polling nền chỉ giữ danh sách mới chứ không tự bật về danh sách hội thoại.
- Sửa nút `Chèn trạng thái đơn` trong panel `Đơn hàng`: sau khi chọn tin từ đơn hàng trên điện thoại, UI tự đóng panel đơn hàng, đưa focus về ô trả lời và hiện trạng thái nhắc kiểm tra trước khi bấm `Gửi`.
- Thêm guard frontend khi ô trả lời đang bị khóa để không chèn nội dung đơn hàng vào trạng thái không có hội thoại.
- Cache-bust `chat.js` sang `chat-mobile-order-send-20260508` trên `chat-marketplace.html` và `profit-dashboard.html`.

### Trạng thái vận hành

- `Shop có API`: vẫn gửi qua Chat API chính thức nếu hội thoại có định danh thật (`buyer_id/session_id`) và app có quyền.
- `Shop không có API`: Shopee/TikTok vẫn fallback automation local theo `chat_transport_core`; không báo đã gửi lên sàn nếu chỉ lưu OMS.
- `Chưa kiểm gửi thật`: không gửi tin thật cho khách trong bước kiểm thử tự động; chỉ kiểm UI/dry-run/khả năng thao tác vì gửi thật cần xác nhận nội dung và hội thoại cụ thể.

## 2026-05-08 - Tách Top SKU và lọc đơn âm tiền trong lãi ròng

### Việc đã làm

- Bổ sung API `/api/order-analytics` trả thêm `loss_order_items` để xem chi tiết từng dòng hàng của đơn âm tiền.
- Top SKU trong tab `Lãi ròng` được tách thành 3 mục ngang: `SKU cần xử lý`, `Đơn âm tiền`, `Tổng quan phí/vốn`.
- Danh sách đơn âm tiền hiển thị SKU, tên sản phẩm, ảnh nếu có, doanh thu dòng hàng, giá vốn, CPO phân bổ, hoàn tiền và lãi âm của dòng hàng.
- Top SKU hiển thị thêm ảnh, số đơn âm, doanh thu, giá vốn và CPO để nhìn nhanh vì sao SKU đang làm âm lãi.

### Trạng thái vận hành

- `Shop có API`: nguồn chuẩn vẫn là `order_analytics`, `order_items`, Payment/Finance API, Ads API và Returns ledger đã lưu; UI chỉ phân tích lại dữ liệu đã đồng bộ.
- `Shop không có API`: dùng dữ liệu đơn/import/browser/manual đã lưu trong `orders_v2/order_items`; không gắn nhãn Payment API và không dùng cost setting làm số phí/lãi chuẩn.
- `Đang làm dở`: nếu đơn thiếu ảnh hoặc thiếu giá vốn thì UI gắn nhãn để vận hành quay lại map SKU/giá vốn trước khi chốt báo cáo.

## 2026-05-08 - Sửa tổng phí sàn trên dashboard lợi nhuận

### Việc đã làm

- Sửa frontend dashboard lợi nhuận để `Tổng Phí Sàn` ưu tiên tổng phí thật trong `orders_v2.fee` khi các bucket chi tiết như `fee_platform`, `fee_payment`, `fee_service` chưa tách được.
- Khi có phần phí chưa tách bucket, UI hiển thị ghi chú tiếng Việt trong chi tiết card để vận hành biết số tổng vẫn là số thật, còn breakdown đang thiếu.
- Công thức `Lãi Thực Tế` và `Lãi TT (Thuế LN 17%)` dùng cùng tổng phí đã fallback, tránh trường hợp card phí hiện `0` làm lãi bị cao sai.

### Trạng thái vận hành

- `Shop có API`: vẫn ưu tiên bucket phí thật khi backend đã tách được; phần chưa tách dùng tổng `orders_v2.fee` để không bỏ sót phí.
- `Shop không có API`: tiếp tục dùng dữ liệu phí đang lưu trong đơn/import/browser, không gắn nhãn Payment API.
- `Chưa làm`: tách sâu toàn bộ bucket còn thiếu cho các dòng chỉ có `orders_v2.fee`.

## 2026-05-08 - Bổ sung endpoint số dư doanh thu và gom UI theo chức năng

### Việc đã làm

- Bổ sung backend Shopee Payment đọc thật các endpoint còn thiếu cho đối soát doanh thu: `get_escrow_list`, `get_escrow_detail`, `get_escrow_detail_batch`, `get_payment_method_list`, `get_payout_detail`.
- Sửa đúng Lazada Finance transaction detail sang `/finance/transaction/details/get` và thêm `/finance/transaction/accountTransactions/query` theo đúng method POST của tài liệu Lazada.
- TikTok chưa đưa vào tab số dư doanh thu trong đợt này vì repo chưa có endpoint Finance/payout chính thức đã xác thực; không tạo fallback từ cost setting để tránh làm sai số thuế/tài chính.
- Frontend `Số dư doanh thu` được tách thành các mục ngang: `Tổng quan`, `Thu nhập đơn`, `Escrow & phí`, `Ví Shopee`, `Payout / billing`, `Lazada Finance`, `File báo cáo`, `Nguồn API`.
- Mỗi mục tài chính chỉ tải dữ liệu của mục đang mở, tránh một lần đổi shop gọi đồng loạt wallet, payout, billing, report và làm trang kéo dài.
- Bảng tài chính giảm font xuống `10-11px`, dùng cuộn ngang nội bộ cho bảng dài để mobile không tràn toàn trang.

### Trạng thái vận hành

- `Shop có API`: Shopee đọc số dư, income detail, escrow, payment method, wallet local, payout/billing/payout detail Cross Border bằng API thật; Lazada đọc Finance nếu app có quyền.
- `Shop không có API`: không gắn nhãn đồng bộ API, chỉ dùng dữ liệu import/browser/manual đã có ở các màn hình khác.
- `Bị chặn bởi quyền/app`: Lazada Finance production có thể vẫn trả lỗi quyền `App does not have permission to access this api`; UI sẽ hiển thị lỗi theo shop, không tạo số fallback.
- `TikTok`: chờ tài liệu/quyền TikTok Shop Finance chính thức trước khi đưa vào số dư doanh thu; không dùng đơn hàng hoặc cost setting để giả lập số dư.
- `Không đưa vào doanh thu seller`: Lazada Wallet Corporate Top-up và LazPay service không được cộng vào số dư seller vì không phải nguồn doanh thu seller chính thức.

## 2026-05-08 - Bổ sung MST, ngày hóa đơn và lọc trùng số hóa đơn nhập

### Việc đã làm

- Sửa parser nội bộ `parseInvoiceText` để nhận MST người mua theo nhiều dạng nhãn: `Mã số thuế người mua`, `MST`, `Tax code`, mã nằm cùng dòng hoặc nằm ở dòng kế tiếp; vẫn tránh lấy nhầm MST người bán khi hóa đơn chỉ có thông tin nhà cung cấp.
- Sửa parser ngày hóa đơn để chuẩn hóa về `YYYY-MM-DD`, nhận được `Ngày ... tháng ... năm ...`, `dd/mm/yyyy`, `dd.mm.yy`, `yyyy-mm-dd` và ngày nằm ngay sau nhãn `Invoice date`.
- Dòng kết quả sau khi bấm `Đọc hóa đơn` hiển thị rõ `Số HĐ`, `Ngày`, `MST người mua`, `Người mua`, parser confidence và cảnh báo còn thiếu nếu có.
- Danh sách hóa đơn nhập tải đủ dữ liệu bằng `GET /api/invoices?all=1`, thêm bộ lọc `Chỉ số HĐ trùng`, chuẩn hóa số hóa đơn trước khi đếm để bắt lệch khoảng trắng/chữ hoa chữ thường, và gắn nhãn `Trùng N` trực tiếp trên dòng bị trùng.
- Cache-bust frontend đổi sang `invoice-manager.js?v=invoice-sku-map-tax-dup-20260508`.

### Đã deploy và kiểm production thật

- Worker API production: `9564522c-fe40-468f-9343-96a68ad53903`.
- Frontend production: `8c3587fd-951a-418c-a49a-89487ad9d153`.
- Chrome CDP mở production `admin-products.html#invoice`, dùng phiên admin tạm đã xóa sau kiểm, chọn đúng file từ `D:\HOÁ ĐƠN ĐIỆN TỬ 2026\LƯU THẾ HẢI\Hóa đơn 0983 Lưu Thế Hải 25.3.26.pdf` và bấm thật `Đọc hóa đơn`.
- Production đọc được `5` sản phẩm, số hóa đơn `00000983`, ngày hóa đơn `2026-03-25`, MST người mua `079079009657`, người mua `Lưu Thế Hải`, parser nội bộ `100%`, mở card xác nhận và tự chọn `5/5` SKU.
- Bộ lọc `Chỉ số HĐ trùng` hiển thị trong danh sách hóa đơn; dữ liệu production hiện có `45` hóa đơn đã lưu và `0` dòng trùng số HĐ sau khi bật bộ lọc.
- Sau kiểm đã xóa session admin tạm khỏi D1, xóa token khỏi localStorage Chrome debug và xóa bản PDF tạm không dấu dùng cho thao tác upload của Chrome CDP.

## 2026-05-08 - Sửa tự map SKU khi đọc hóa đơn nhập

### Việc đã làm

- Sửa `invoice-manager.js` để map SKU hóa đơn theo tên đã chuẩn hóa tiếng Việt, SKU nội bộ, tên sản phẩm, mô tả, tồn kho và giá vốn gần với đơn giá trên hóa đơn.
- Map đã học từ `invoice_sku_map` chỉ còn dùng khi tên hóa đơn khớp chuẩn hóa chính xác, tránh lấy nhầm SKU cũ vì các dòng có cùng thông số điện áp/kích thước.
- Thiếu MST người mua không còn hiển thị như lỗi chặn thao tác; UI đổi thành ghi chú và nói rõ vẫn có thể lưu nếu dòng hàng/SKU đã đúng.
- Thêm cache-bust `invoice-manager.js?v=invoice-sku-map-20260508` cho `admin-products.html` để production không giữ script cũ.

### Đã deploy và kiểm production thật

- Frontend production: `c5243057-f43e-4fb9-bd7f-04c25cdaa6f9`.
- Chrome CDP mở production `admin-products.html#invoice`, dùng phiên admin tạm đã xóa sau kiểm, upload PDF kiểm thử có 5 dòng tương ứng case ảnh lỗi và bấm thật `Đọc hóa đơn`.
- Production đọc được `5` sản phẩm, mở card xác nhận, cả `5/5` dòng đều tự chọn SKU: `1_DUI_DEN_428A_K64`, `K259_PHICHCAM90DO`, `1 MÁY HÚT XANH`, `K54HOAANHDAO24CM`, `K54HOAANHDAO27CM`.
- Sau kiểm đã xóa session admin tạm khỏi D1 và xóa token khỏi localStorage Chrome debug.

## 2026-05-08 - Tối ưu giao diện cảnh báo dữ liệu sản phẩm

### Việc đã làm

- Chia tab `Cảnh báo` trong trang quản lý sản phẩm thành các mục chức năng: `Tồn kho`, `Giới hạn API`, `Audit SKU`, `Snapshot ngày`.
- Đổi các card cảnh báo dài sang bảng ngang font nhỏ `11px`, dùng `table-layout: fixed` trên desktop để một hàng nhìn đủ các cột chính trong khung.
- Tách số liệu audit thành ô metric nhỏ và danh sách lỗi thành bảng riêng để người vận hành không phải kéo qua nhiều card.
- Thêm auto-load core catalog khi mở tab `Cảnh báo`, tránh trạng thái vào tab chỉ thấy `Đang tải dữ liệu...`.

### Đã deploy và kiểm production thật

- Frontend production: `11eb1e5e-44b9-41c3-b8b3-db4caa64b1e0`.
- Chrome CDP mở `admin-products.html`, bấm thật `Kết nối & Đồng bộ` rồi bấm tab `Cảnh báo`: hiện `5` bảng ngang, `8` dòng lệch tồn, `8` dòng gần hết hàng, `2` dòng giới hạn API, `11` metric audit và `2` dòng lịch sử snapshot.
- Kiểm desktop `1440px`: font bảng `11px`, `table-layout=fixed`, bảng đầu `scrollWidth=1021` bằng `clientWidth=1021`, không cần kéo ngang.
- Kiểm mobile `390px`: `bodyWidth=390`, `viewportWidth=390`, bảng giữ cuộn ngang nội bộ `720px` để không làm tràn toàn trang.

## 2026-05-08 - Bổ sung Shopee Shop snapshot theo endpoint trong hình

### Việc đã làm

- Thêm core `shopee-shop-profile-core` để gom nhóm endpoint Shopee Shop đọc-only: `get_shop_info`, `get_profile`, `get_warehouse_detail`, `get_shop_notification`, `get_authorised_reseller_brand`, `get_br_shop_onboarding_info`, `get_shop_holiday_mode`.
- Thêm Worker `GET /api/shops/shopee-snapshot` để gọi API Shopee thật theo từng shop, tự refresh token khi access token hết hạn và trả kết quả từng endpoint kèm lỗi quyền nếu có.
- Thêm `GET /api/shops/shopee-write-guards` để ghi rõ `update_profile` và `set_shop_holiday_mode` đang khóa preview/admin/confirm/log, chưa gọi thật.
- Trung tâm API nâng cao có nút `Đọc hồ sơ shop` trên từng shop Shopee API để hiện snapshot hồ sơ, kho, thông báo, brand và chế độ nghỉ ngay trong modal.
- Thêm action `Đọc Open Campaign` cho Shopee AMS `get_open_campaign_added_product`, chỉ đọc sản phẩm đang nằm trong Open Campaign, commission rate, trạng thái campaign và thời gian khuyến mãi.

### Trạng thái vận hành

- `Shop có API`: Shopee có thể đọc snapshot Shop API trực tiếp từ Trung tâm API.
- `Shop không có API`: vẫn xử lý thủ công/Seller Center, không gắn nhãn đồng bộ API.
- `Bị khóa an toàn`: chưa bật `update_profile` và `set_shop_holiday_mode` vì đây là lệnh ghi thay đổi hồ sơ/trạng thái shop thật.
- `Bị chặn bởi quyền/app`: Shopee AMS Open Campaign có thể báo shop chưa đồng ý AMS T&C hoặc thiếu quyền `Affiliate Marketing Solution Management`; khi lỗi phải xử lý trên Seller Center/Open Platform trước.

### Đã deploy và kiểm production thật

- Worker API production: `e9b9eca2-ab87-4ba5-ae4a-4758bdabc4ca`.
- Frontend production: `d29651fb-9d22-4d68-8d1c-a29822af98c1`.
- `GET /api/shops/shopee-snapshot?shop=chihuy2309` trả `partial_error`, trong đó 4 endpoint đọc được (`get_shop_info`, `get_profile`, `get_shop_notification`, `get_shop_holiday_mode`) và 3 endpoint Shopee báo thiếu whitelist/vùng/quyền (`get_warehouse_detail`, `get_authorised_reseller_brand`, `get_br_shop_onboarding_info`).
- Chrome CDP mở `oms-dashboard.html#api-advanced`, bấm thật nút `Đọc hồ sơ shop` trong thẻ `chihuy2309`; UI hiện 9 dòng snapshot gồm 7 endpoint đọc và 2 guard ghi.
- Kiểm mobile 390px sau khi mở snapshot: `bodyWidth=390`, `viewportWidth=390`, modal rộng 374px, không tràn ngang.
- `POST /api/advanced/modules/actions` với action `read_open_campaign_products`, shop `chihuy2309`, đã gọi thật endpoint `/api/v2/ams/get_open_campaign_added_product`; Shopee trả `This app type has no permission to this API.`, nên tính năng đã nối nhưng đang bị chặn bởi quyền app/AMS.
- Chrome CDP sau deploy cuối mở mobile 390px, Trung tâm API hiển thị module Marketing có nút `Đọc Open Campaign`; `bodyWidth=390`, `viewportWidth=390`, modal rộng 374px.
- Kiểm lại Lazada video sau deploy cuối: `GET /api/video/lazada/quota?shop=kinhdoanhonlinegiasoc@gmail.com` trả `ok`, quota còn `39374989335`, đã dùng `3574683625`, tổng `42949672960`.

## 2026-05-08 - Tạo luồng file upload giá khuyến mãi TikTok từ giá Shopee

### Việc đã làm

- Kiểm file mẫu TikTok `C:/Users/Admin/Downloads/Product Discount.xlsx`: template chỉ có các cột `Product_id`, `SKU_id`, `Deal Price`, giới hạn mua; chưa có dữ liệu ID sản phẩm.
- Sửa Worker `/api/sync-variations` để filter được `platform` và trả thêm `model_id` khi đọc catalog, vì TikTok cần `SKU_id/model_id` để upload giá KM hàng loạt.
- Sửa parser TikTok trong Python để từ lần đồng bộ sau sẽ giữ `sku_id/model_id` thay vì chỉ lưu seller SKU.
- Thêm công cụ `oms_python/platforms/tiktok/promotion/tiktok_discount_template.py` để tạo file upload TikTok từ mẫu TikTok + giá khuyến mãi Shopee trong OMS.
- Công cụ chỉ lấy sản phẩm/phân loại TikTok còn tồn, chỉ dùng giá KM Shopee còn tồn và thấp hơn giá gốc, chọn giá KM Shopee thấp nhất nếu cùng SKU xuất hiện ở nhiều shop.
- Công cụ đã hỗ trợ thêm file `Tải xuống ID sản phẩm` của TikTok qua tham số `--tiktok-id-file`, đọc được cả file `.zip` TikTok và tự sửa lỗi metadata Excel chỉ khai báo vùng dữ liệu đến dòng hướng dẫn.

### Đã deploy và kiểm thực tế an toàn

- Worker production đã deploy version `cc4eeb5a-11da-4a1c-ad7b-491aec9375d3`.
- `python -m py_compile` pass cho `oms_python/core/utils.py` và `oms_python/platforms/tiktok/promotion/tiktok_discount_template.py`.
- `node --check apps/worker-api/src/routes/products.js` pass.
- Kiểm production `GET /api/sync-variations?platform=tiktok&shop=0909128999&include_out_of_stock=0`: trả `148` dòng tồn `> 0` và response đã có trường `model_id`.
- Chạy tạo file từ mẫu TikTok thật, file ID TikTok `.zip` và giá Shopee `chihuy1984`, `chihuy2309`: đọc được `148` dòng TikTok còn tồn, `295` dòng Shopee, `272` dòng Shopee có giá KM dùng được.
- Kết quả chạy hiện tại `matched_rows=117`, `skipped_rows=31`; file upload đã tạo tại `auto OMS Python/runtime_jobs/tiktok_discount_upload/tiktok_discount_from_shopee_0909128999_20260508_194154.xlsx`, report đi kèm ghi rõ lý do bỏ dòng.

### Trạng thái phase

- `Đã xong`: core tạo file upload TikTok từ giá Shopee đã có, giữ đúng mẫu TikTok và có report lý do bỏ dòng.
- `Shop có API`: Shopee `chihuy1984`, `chihuy2309` là nguồn giá KM đọc từ cache/API Shopee đã đồng bộ.
- `Shop không API`: TikTok `0909128999` vẫn dùng file TikTok Seller Center; luồng hiện tại đã tạo được file upload giá KM khi có mẫu `Product Discount.xlsx` và file ID sản phẩm TikTok.
- `Bị khóa an toàn`: chưa tự upload file lên TikTok và chưa bấm apply thật; file tạo ra chỉ để người vận hành kiểm rồi upload thủ công.

## 2026-05-08 - Sửa luồng giá khuyến mãi Shopee/TikTok theo đúng shop API

### Việc đã làm

- Chốt lại phân nhóm vận hành: `chihuy2309`, `chihuy1984` và Lazada là shop có API; `phambich2312`, `khogiadungcona`, `0909128999` là nhóm chưa có API/đi browser hoặc file.
- Sửa app Python local: nút `Cào Giá KM Shopee -> Web` với shop Shopee có API sẽ gọi Worker `/api/discounts/shopee/sync`, không mở Chrome Seller Center.
- Khóa nhánh `Up Giá KM Web -> Shopee` cho shop Shopee có API trong app local; apply thật phải đi qua preview/queue trên web, không dùng upload Excel tự động để tránh ghi nhầm giá.
- Giữ browser khuyến mãi Shopee làm fallback cho shop chưa API, nhưng parser Excel đã đọc header/cột SKU/giá KM linh hoạt hơn, không phụ thuộc đúng một tên cột.
- Khi tạo file upload giá KM Shopee, bot tạo bản copy `*_oms_gia_km.xlsx` và giữ file gốc để đối chiếu, không ghi đè file Shopee tải về.
- TikTok chưa có bot khuyến mãi riêng trong local app; template TikTok nếu có cột `sale_price/discount_price/special_price/promotion_price` thì core sẽ lưu vào `discount_price`, còn nút up giá TikTok vẫn khóa.

### Đã kiểm thực tế an toàn

- `python -m py_compile` pass cho `shopee_promo.py`, `sync_product_tab.py` và `core/utils.py`.
- Test parser Excel Shopee bằng file mẫu có dòng hướng dẫn trước header: đọc đúng `2` dòng giá KM và tạo đúng file copy upload.
- Test parser TikTok bằng template mẫu có `sale_price`: chỉ dòng sale thấp hơn giá gốc mới vào `discount_price`.
- Kiểm token thật trên Worker: `chihuy2309=True`, `chihuy1984=True`, `phambich2312=False`, `khogiadungcona=False`.
- Chạy Worker production `POST /api/discounts/shopee/sync`:
  - `chihuy2309`: đồng bộ `1` chương trình, `178` dòng sản phẩm/model khuyến mãi.
  - `chihuy1984`: đồng bộ `1` chương trình, `179` dòng sản phẩm/model khuyến mãi.
- Kiểm tra cache TikTok production shop `0909128999`: đang có `148` dòng variation, `148` dòng đều tồn kho `> 0`, `discount_price` hiện `0` vì template đang lưu giá bán thường, chưa có cột giá sale riêng.
- Có thử luồng browser read-only với `chihuy1984`; profile chưa đăng nhập nên dừng đúng guard, không tự điền mật khẩu/OTP.

### Trạng thái phase

- `Đã xong`: routing local cho giá KM Shopee đã API-first; shop có API không còn bị mở Chrome ở nút cào giá KM.
- `Shop có API`: `chihuy2309` và `chihuy1984` đọc khuyến mãi qua Shopee Discount API read-only, lưu cache D1 để web phân tích.
- `Shop không API`: Shopee chưa API vẫn dùng browser/Excel có log; TikTok `0909128999` dùng export template sản phẩm, chưa có endpoint/bot khuyến mãi riêng.
- `Bị khóa an toàn`: apply thật giá KM lên Shopee/TikTok chưa tự chạy; Shopee API apply phải đi qua preview/queue và quyền admin.

## 2026-05-08 - Tối ưu log/export sản phẩm TikTok theo job

### Việc đã làm

- Sửa luồng `TikTokProducts` để mỗi lượt tải ZIP tạo một `job_id` riêng trong `runtime_jobs/tiktok_product_export`, không dùng lại file tạm cố định theo shop.
- Sau khi giải nén ZIP, bot quét đệ quy toàn bộ file trong thư mục con, tránh bỏ sót template khi TikTok đóng gói Excel trong folder lồng nhau.
- Thêm core gom template TikTok: đọc tất cả `template_*.xlsx/csv`, bỏ template rỗng, merge sản phẩm theo `product_id` và phân loại theo SKU/model rồi mới lọc tồn `> 0`.
- Chỉ sync qua `ProductCoreHub` một lần sau khi gom xong toàn bộ template, thay vì mỗi template lại tạo một lượt log/lọc/sync riêng.
- R2 chỉ upload các template có dữ liệu, template rỗng chỉ được đếm trong tổng kết để log gọn.

### Đã kiểm thực tế an toàn

- `python -m py_compile` pass cho `oms_python/core/utils.py` và `platforms/tiktok/products/tiktok_products.py`.
- Chạy dry-run bằng export TikTok thật đã lưu trong `desktop_archive`: đọc `15` template, gom thành `77` sản phẩm / `144` phân loại còn tồn, dự kiến sync `2` lô, không ghi lại production vì đây là file cũ.
- Chạy thêm test template rỗng: job đọc `3` template, bỏ đúng `1` template rỗng, gom `11` sản phẩm / `24` phân loại còn tồn.

### Trạng thái phase

- `Đã xong`: code gom job TikTok, bỏ template rỗng và log tổng gọn hơn.
- `Shop không API`: TikTok `0909128999` tiếp tục dùng browser/export Excel, nhưng log sẽ hiển thị theo job thay vì theo từng template nhỏ.
- `Chờ kiểm live lần tới`: khi bấm `Bot Đồng Bộ SP Excel` cho TikTok trên Seller Center thật, cần xác nhận log mới và kết quả endpoint production sau sync.

## 2026-05-08 - Rút gọn màn Kết nối & Đồng bộ sản phẩm

### Việc đã làm

- Tách màn `Kết nối & Đồng bộ` trong `admin-products` thành 5 tab con: `Tổng quan`, `Giá khuyến mãi`, `Bài đăng / model`, `Kết nối API`, `Cảnh báo`.
- Đổi khối sửa giá từ nhập SKU thủ công sang bảng trực quan theo shop: tên sản phẩm, SKU sàn, giá gốc, giá khuyến mãi hiện tại, ô nhập giá KM mới và tồn kho.
- Đổi khối preview sửa/ẩn/xóa bài đăng/model sang bảng bài đăng theo shop, có tên sản phẩm, item ID, số SKU/model, giá đang bán, tồn và ô sửa tên trực tiếp.
- Giữ phần nhập nhanh bằng SKU/item ID ở mục `Nâng cao` để đội kỹ thuật vẫn dùng được khi cần thao tác hàng loạt đặc biệt.
- Đổi phần kết nối API/kho từ bảng kéo dài sang thẻ shop gọn, mỗi thẻ hiển thị sàn, shop, luồng xử lý, trạng thái API, kho lấy hàng và nhóm nút thao tác.

### Đã deploy và kiểm thực tế

- Frontend production đã deploy version `5e57e420-a20a-46a1-bd35-139cce287588`.
- Mở production `admin-products#shops` qua Chrome profile `ProductionAdminTest`, tạo phiên reviewer tạm trong D1 để kiểm UI read-only rồi xóa session tạm sau khi kiểm.
- Xác nhận production đã tải đúng asset `product-ops-tabs-20260508`, hiển thị đủ 5 tab con và tab mặc định `Tổng quan`.
- Tab `Giá khuyến mãi` tải thật `146` SKU còn tồn của shop `chihuy2309`, render `120` dòng đầu với cột `Sản phẩm`, `Giá gốc`, `Giá KM hiện tại`, `Giá KM mới`, `Tồn`.
- Tab `Bài đăng / model` tải thật `194` bài đăng của shop `chihuy2309`, render `100` dòng đầu với cột `Bài đăng`, `Item ID`, `SKU/model`, `Giá đang bán`, `Tồn`, `Tên mới`.
- Tab `Kết nối API` render `6` thẻ shop, không còn bảng dài khó nhìn.
- Mobile viewport `390px`: `documentElement.scrollWidth=390`, không tràn ngang; ảnh kiểm lưu tại `artifacts/admin-products-price-mobile.png`.

### Trạng thái phase

- `Đã xong`: rút gọn UI vận hành sản phẩm theo tab con và bảng trực quan theo shop; dữ liệu vẫn đọc từ catalog đồng bộ thật.
- `Shop có API`: hiển thị trong các tab giá/bài đăng/model để preview thao tác API; lệnh đẩy thật vẫn đi qua guard hiện có.
- `Shop không API`: chỉ dùng dữ liệu catalog/import/browser đã đồng bộ để tham chiếu, không gắn nhãn đồng bộ API.
- `Bị khóa an toàn`: chưa mở apply thật hàng loạt `update_price` lên sàn; nút hiện tại chỉ lưu giá KM trong OMS hoặc preview payload trước.

## 2026-05-08 - Chuẩn hóa profile Chrome local và kiểm thực tế TikTok

### Việc đã làm

- Thêm core `profile_paths` cho Python local để mọi luồng mở Chrome đều đưa profile về `auto OMS Python/profiles/browser`.
- Sửa các tab/local helper đang mở Chrome như đăng nhập, đồng bộ sản phẩm, đồng bộ đơn, auto run, chat, report và browser Shopee để dùng chung core profile thay vì tự ghép đường dẫn rời rạc.
- Sửa cấu hình shop `khogiadungcona` từ profile ngoài `E:/data login` về profile trong project.
- Dọn hai profile bị tạo nhầm trên Desktop vào backup nội bộ `auto OMS Python/profiles/desktop_misplaced_backup/20260508_173444`, không còn để folder profile trên Desktop.
- Chạy thực tế TikTok shop `0909128999` bằng Chrome profile trong project, tải file export thật, xử lý các template Excel và đồng bộ lên OMS.

### Đã kiểm thực tế

- Kiểm tiến trình Chrome/Python: profile đang chạy dùng `E:\shophuyvan-analytics\auto OMS Python\profiles\browser\...`, không có Chrome nào dùng profile Desktop hoặc `E:\data login`.
- Kiểm Desktop: không còn thư mục `HuyVan_Bot_Data*`.
- Mở lại profile đã di chuyển của `khogiadungcona` vào Seller Center, phiên đăng nhập vẫn còn sống và không bị chuyển về trang login.
- Chạy `python -m py_compile` cho các file Python đã sửa, không lỗi cú pháp.
- Kiểm TikTok production sau sync: `GET /api/sync-variations?shop=0909128999` trả `148` dòng còn tồn, `min_stock=1`, `zero_or_less=0`.
- Kiểm dữ liệu cũ khi gọi rõ `include_out_of_stock=1`: tổng `234` dòng, trong đó `86` dòng tồn `0` hoặc nhỏ hơn bị ẩn khỏi luồng vận hành mặc định.

### Trạng thái phase

- `Đã xong`: profile Chrome local đã được gom về `auto OMS Python/profiles/browser`; Desktop không còn profile bot; TikTok `0909128999` đã chạy đồng bộ thực tế và chỉ hiển thị sản phẩm còn tồn.
- `Shop có API`: tiếp tục chạy API, không tự mở Chrome khi đồng bộ sản phẩm.
- `Shop không API`: Shopee/TikTok dùng browser hoặc file export có log, nhưng profile bắt buộc nằm trong thư mục project để dễ quản lý và backup.
- `Cần tối ưu tiếp`: TikTok export hiện tách nhiều file template, bot vẫn xử lý lần lượt từng file nên log dài; hướng tiếp theo là gom thư mục tải tạm theo job, bỏ template rỗng và tổng hợp log theo một lượt sync.

## 2026-05-08 - Đồng bộ sản phẩm chỉ lấy tồn kho lớn hơn 0

### Việc đã làm

- Chuẩn hóa bộ lọc tồn kho trong `ProductCoreHub`: mọi payload sản phẩm trước khi gửi lên OMS chỉ giữ phân loại có `stock > 0`, tự bỏ sản phẩm không còn phân loại hợp lệ.
- Sửa parser Excel Shopee/Lazada/TikTok để dùng chung bộ lọc tồn kho, log rõ số sản phẩm/phân loại bị bỏ vì hết tồn.
- Sửa luồng Shopee API và Lazada API để lọc tồn `> 0` trước khi lưu knowledge, snapshot catalog và `product_variations`.
- Sửa Worker `/api/sync-variations`: mặc định không nhận/không trả phân loại tồn `0`; muốn xem dữ liệu cũ phải gọi rõ `include_out_of_stock=1`.
- Sửa nút local `Bot Đồng Bộ SP Excel`: chọn `Tất cả shop` sẽ chạy tuần tự từng shop; Shopee có API đi API và không mở Chrome; shop chưa API mới dùng Chrome/browser.
- Sửa bot browser để nếu profile Chrome đang mở sẵn cho chat/radar thì kết nối lại qua CDP, không mở trùng profile gây lỗi khóa Chrome.
- Cài `python-calamine` cho Python local vì file Excel Shopee thật không đọc ổn bằng `openpyxl` do style Excel không chuẩn.

### Đã deploy và kiểm thực tế

- Worker production đã deploy version `049d2ae2-15b2-4646-a601-72128e93a0f1`.
- Kiểm endpoint production `GET /api/sync-variations?shop=chihuy2309`: mặc định trả `146` dòng, `zero_or_less=0`; khi bật `include_out_of_stock=1` thấy `238` dòng hết tồn cũ.
- Gửi payload test chỉ có tồn `0` lên `/api/sync-variations`: Worker trả `synced=0`, `skipped_out_of_stock=1`, `skipped_zero_stock_variations=1`.
- Chạy API sync thật cho Shopee `chihuy1984`: lấy `40` sản phẩm, sync `31` sản phẩm còn tồn, bỏ `9` sản phẩm hết tồn và `22` phân loại tồn `0`, ghi `68` phân loại, không warning.
- Kiểm lại `GET /api/sync-variations?shop=chihuy1984`: `149` dòng mặc định, `min_stock=1`, `zero_or_less=0`.
- Chạy Chrome Excel thật cho shop chưa API `phambich2312` qua Chrome đang mở sẵn CDP port `9589`: Shopee gài bộ lọc `Tồn kho >= 1`, tải đủ `basic/sales/media` Excel.
- Ghép 3 file Excel `phambich2312`: giữ `76` sản phẩm / `137` phân loại còn tồn, bỏ `16` phân loại tồn `0`, sync lên OMS `127` phân loại qua 2 lô.
- Kiểm lại `GET /api/sync-variations?shop=phambich2312`: `129` dòng mặc định, `min_stock=2`, `zero_or_less=0`.
- Chạy Chrome Excel thật cho shop chưa API `khogiadungcona`: Shopee gài bộ lọc `Tồn kho >= 1`, tải đủ 3 file Excel, giữ `72` sản phẩm / `127` phân loại còn tồn, bỏ `24` phân loại tồn `0`, sync lên OMS `117` phân loại qua 2 lô.
- Kiểm lại `GET /api/sync-variations?shop=khogiadungcona`: `125` dòng mặc định, `min_stock=1`, `zero_or_less=0`.

### Trạng thái phase

- `Đã xong`: lọc tồn `> 0` cho API Shopee/Lazada, Excel Shopee/Lazada/TikTok, ProductHub và Worker production.
- `Shop có API`: `chihuy1984` chạy qua API, không mở Chrome; dữ liệu hết tồn bị bỏ trước khi ghi bảng vận hành.
- `Shop không API`: `phambich2312`, `khogiadungcona`, `0909128999` dùng browser/import Excel có log; không gắn nhãn API. Đã kiểm thực tế 2 shop Shopee chưa API là `phambich2312`, `khogiadungcona` và TikTok `0909128999`.
- `Đã kiểm bổ sung`: TikTok `0909128999` đã sync thực tế, endpoint mặc định còn `148` dòng tồn `> 0`, dữ liệu tồn `0` chỉ xem lại khi gọi rõ `include_out_of_stock=1`.

## 2026-05-08 - Shopee Go Live Review Mode

### Việc đã làm

- Tạo trang production riêng `apps/fe/pages/shopee-review.html` để Shopee reviewer vào đúng màn chứng minh sản phẩm live, không phải tự mò trong dashboard chung.
- Thêm `apps/fe/js/shopee-review.js` đọc dữ liệu thật bằng các endpoint GET: capability shop, dashboard video, queue video và webhook/core.
- Thêm `apps/fe/css/shopee-review.css` mobile-first, bảng gọn, không tràn ngang trên desktop/mobile.
- Cập nhật `auth-guard.js` cho phép role `reviewer` vào `shopee-review.html` và `dashboard_video.html`, nhưng vẫn khóa mọi lệnh ghi.
- Cập nhật `login.js` để tài khoản role `reviewer` mặc định vào trang Shopee Review Mode sau khi đăng nhập.
- Đồng bộ lại tài khoản `shopee_reviewer` về role `reviewer`; không lưu mật khẩu trong repo/tài liệu.

### Đã deploy và kiểm thực tế

- Frontend production cuối: `fc405663-6027-4c57-bbf7-066c3dfb070f`.
- API login production bằng `shopee_reviewer` trả `role=reviewer`.
- Reviewer gọi GET `/api/video/capabilities`, `/api/video/dashboard`, `/api/video/upload-queue` thành công.
- Reviewer gọi thử POST `/api/video/sync` bị chặn đúng `403`, xác nhận chế độ chỉ đọc hoạt động.
- Chrome production qua CDP mở `shopee-review.html`: hiển thị `8` thẻ trạng thái, `8` dòng bằng chứng, title tiếng Việt đúng.
- Desktop `1365px`: không tràn ngang, `scrollWidth=1350`.
- Mobile `390px`: không tràn ngang, widget tài khoản nổi không còn đè đầu trang, nút đăng xuất nằm trong thẻ reviewer.
- Reviewer mở được `dashboard_video.html` bằng quyền xem, không bị màn `Không có quyền truy cập`; trang tự gắn `readonlyRole=reviewer`.

### Trạng thái phase

- `Đã xong`: trang review live cho Shopee Go Live, route quyền reviewer, kiểm chứng read-only trên API và UI production.
- `Bị khóa an toàn`: reviewer không thể sync/upload/sửa/xóa/gửi lệnh lên sàn; mọi POST/PUT/PATCH/DELETE tiếp tục bị chặn ở frontend và Worker.
- `Shop có API`: Shopee `chihuy1984` hiển thị Video API đã test quyền OK và cache thư viện video live.
- `Shop không API`: vẫn chỉ hiển thị theo luồng tham chiếu/manual/browser upload có log, không gắn nhãn đồng bộ API.

### Nên điền lại form Shopee

- `Business Product URL`: `https://shophuyvan-analytics.nghiemchihuy.workers.dev/pages/shopee-review`
- `Live Test Username`: `shopee_reviewer`
- `Remarks`: dùng nội dung gợi ý trong chính trang Review Mode để Shopee biết reviewer chỉ đọc và có thể kiểm Dashboard, OMS, Product/SKU, Shopee Video.

## 2026-05-08 - Kiểm luồng Chrome local đăng video shop chưa API

### Việc đã làm

- Kiểm helper local `127.0.0.1:8765` đang chạy và route `/video-upload-preview` hoạt động.
- Tạo job test an toàn cho shop `chihuy2309` bằng chiến dịch đa shop vì shop này có catalog nhưng chưa sẵn sàng Shopee Video API.
- Gọi helper local cho job test `vup_627156f9-2c2b-4aac-a8df-39529240195b`; helper mở Chrome profile shop bằng debug port `9354`.
- Chrome mở tới Shopee Creator Center upload URL nhưng bị chuyển về màn đăng nhập Seller Center, nên job ghi đúng trạng thái `browser_login_required`.
- Sau khi người vận hành đăng nhập Seller Center trong Chrome local, tạo job test mới `vup_4ad4a9b0-bafc-4875-87ec-9014de155605` và gọi lại helper: file được tải từ R2 về máy, đưa lên Shopee Creator Center, tiêu đề được điền và job chuyển `browser_preview_ready`.
- Ô gắn sản phẩm chưa tự điền ở lần test này vì vùng thêm sản phẩm chưa hiện đúng input tìm kiếm khi script chạy; cần bổ sung bước tự mở modal sản phẩm trước khi điền item.
- Hủy job test sau khi kiểm để không lẫn dữ liệu vận hành.
- Sửa UI `dashboard_video`: sau khi tạo chiến dịch đa shop có shop chưa API, web mở sẵn tab helper trong cùng thao tác bấm nút và tự chạy job Chrome đầu tiên khi backend trả `queue_id`.

### Đã deploy và kiểm thực tế

- Frontend production: `26a860f6-9392-40e6-8637-2090d116d92a`.
- `node --check apps/fe/js/video-dashboard.js` pass.
- Production asset `/js/video-dashboard.js` đã có `openBrowserVideoUpload`, `isProductionFrontend` và logic mở sẵn tab helper.
- Cửa sổ Chrome thật đã xuất hiện với tiêu đề `Đăng Nhập Ngay Vào Để Quản Lý Cửa Hàng Của Bạn | Kênh Người Bán Shopee Việt Nam`.
- Sau khi đăng nhập, Chrome thật ở URL `https://banhang.shopee.vn/creator-center/video-upload/upload`, body Shopee hiển thị file `vup_4ad4a9b0-bafc-4875-87ec-9014de155605.mp4`, `Tải thành công`, tiêu đề đã điền và các nút `Lưu bản nháp` / `Đăng` / `Xem trước`; không bấm đăng thật.

### Trạng thái phase

- `Đã xong`: helper local mở được Chrome thật cho job shop chưa API; UI đã auto mở tab helper khi tạo chiến dịch có job Chrome.
- `Đang cần thao tác người vận hành`: profile shop `chihuy2309` cần đăng nhập/xác minh Seller Center trước, sau đó bấm lại `Mở Chrome` hoặc tạo job mới thì helper mới upload file và dừng ở preview.
- `?? ki?m sau ??ng nh?p`: helper chuy?n ???c t? `browser_upload_required` sang `browser_preview_ready`.
- `?? ki?m g?n s?n ph?m`: helper d?ng `product_name` t? catalog snapshot c?a ??ng shop, t? m? popup `Th?m s?n ph?m`, t?m s?n ph?m, tick d?ng kh?p, b?m `X?c nh?n`, tick ?i?u kho?n v? d?ng ? tr?ng th?i n?t `??ng` ?? b?t; job test `vup_90072cfd-0a62-476a-bf1b-35085c56212e` ?? h?y trong backend sau ki?m.
- `Bị khóa an toàn`: helper không bấm nút đăng thật; chỉ upload/điền nội dung và dừng ở preview.

## 2026-05-07 - Tạo baseline checklist tổng thể

### Việc đã làm

- Đã rà lại bộ chỉ mục local của `Shopee` và `Lazada` đã quét từ tài liệu gốc.
- Đã gom `805` endpoint thành các nhóm nghiệp vụ thật của OMS:
  - Order / reverse / finance
  - Product / SKU / stock
  - ADS
  - Video
  - Chat
  - Promotion
  - Payment
  - Review
  - Push / webhook
  - Logistics
  - Shop health
- Đã lưu checklist master tại:
  - `docs/marketplace-endpoint-master-checklist.md`

### Trạng thái baseline

- Product / SKU / stock: đã có core nền, đang làm dở
- ADS: đã có page riêng và guard preview, đang làm dở
- Video: Shopee đã có trung tâm video, Lazada media chưa làm
- Chat: đã tách API / không API, Lazada IM full chưa làm
- Order / reverse / finance: đang làm dở, cần ưu tiên hoàn tất
- Promotion / review / shop health / push coverage: chưa làm đủ

### Việc bắt buộc từ các phase sau

- Mỗi lần hoàn tất một phase phải cập nhật lại file master checklist.
- Đồng thời thêm một mục mới vào file tiến độ này:
  - ngày
  - việc đã làm
  - phần nào đã xong
  - phần nào còn khóa
  - phần nào bị chặn bởi quyền/app

## 2026-05-07 - chat core: dấu tiếng Việt, resolve sản phẩm đúng sàn/shop, guard AI tên sàn

### Việc đã làm

- Sửa text lỗi dấu trong `Cài đặt chat`, nút automation, trạng thái guard và các nhãn chat hay nhìn thấy trên production.
- Tab `Sản phẩm` của chat hiện đúng `link sản phẩm` thật của shop đang chat, không chỉ hiện tên sản phẩm.
- `Lưu ý SP` đổi hướng core: không còn tin `related_product_url` như nguồn chuẩn. Khi chèn lưu ý hoặc gửi thẻ SP, frontend sẽ resolve lại sản phẩm theo `platform + shop + related_item_id / SKU / tên` từ catalog sản phẩm đã đồng bộ của đúng hội thoại.
- Nếu link advisory lệch `platform` hoặc lệch `shop`, OMS tự khóa link và không chèn/gửi bừa sang sàn khác.
- AI guard thêm chặn cứng `Shopee / Lazada / TikTok / Shop Huy Van` ở cả:
  - luật runtime `/api/chat/guard`
  - cấu hình `AI & Luật`
  - prompt AI backend

### Đã deploy và kiểm thực tế

- Worker production: `e2675342-e67d-4878-8df6-8c54d64e1e39`
- Frontend production cuối: `3ab15853-ab3a-4bd6-93ef-c016b9f7b774`
- Reload production `chat-marketplace` bằng Chrome thật qua CDP `127.0.0.1:9333`, xác nhận đang dùng script `chat-fixes-20260507b`.
- Mở `Cài đặt chat > Lưu ý SP` ở hội thoại `Shopee · chihuy1984`, card matched advisory hiện:
  - link thật `shopee.vn/product/170044686/14677195925`
  - tên sản phẩm gửi kèm đúng
- Chạy `insertChatProductAdvisory(0)` trên production:
  - ô trả lời được chèn `Link sản phẩm gửi kèm: https://shopee.vn/product/170044686/14677195925`
  - không còn chỉ hiện tên sản phẩm
- Kiểm resolver production:
  - advisory matched `related_item_id=14677195925`
  - resolver map lại đúng `resolvedProductName=Gioăng Bồn Cầu Ngăn Mùi Hôi, Ngăn Côn Trùng – Linh Kiện Cực Cần Khi Lắp Bồn Cầu K168`
  - nếu giả lập đổi `platform=lazada` hoặc đổi cả `shop + shop_id` sang shop khác thì `chatSafeAdvisoryRelatedUrl` trả rỗng, link bị khóa
- Kiểm AI guard production:
  - content chứa `Shopee / Lazada / TikTok` bị `allowed=false`
  - content chứa `Shop Huy Van` cũng bị block

### Trạng thái phase này

- `Đã xong`: sửa lỗi dấu phần chat, tách khu cài đặt chat, chèn link sản phẩm đúng sàn/shop, advisory resolve lại từ catalog đồng bộ, chặn cứng tên sàn/tên shop trong AI.
- `Đang làm dở`: `chat_identity_core`, `chat_conversation_aliases`, `AI auto-reply thật`.
- `Bị chặn bởi quyền/app`: Lazada IM vẫn đang chờ quyền app; chỉ khi được cấp quyền mới mở tiếp luồng Lazada IM chính thức.

### Shop có API đang chạy thế nào

- Shopee có API: ưu tiên SellerChat/Webchat đang có trong hệ thống; gửi text và thẻ sản phẩm qua luồng API có guard.
- Lazada có API nhưng chưa đủ quyền IM: tạm giữ note console pending, chưa mở tiếp luồng IM thật.

### Shop không có API đang fallback thế nào

- TikTok và các shop Shopee chưa có token chat còn sống: vẫn đi `Chrome fallback / manual reference`, chỉ quét ngoài hoặc mở sâu có kiểm soát; không gắn nhãn realtime API.

### Vấn đề để mai tiếp tục

- Đưa resolver sản phẩm chat xuống core/backend chung để không chỉ FE dùng, tránh lệch giữa `Lưu ý SP`, `Gửi thẻ SP`, AI và automation.
- Hoàn thiện `chat_identity_core` và `chat_conversation_aliases`.
- Chỉ làm tiếp Lazada IM sau khi app được cấp đủ quyền IM chính thức.
  - shop không API đang fallback thế nào

## 2026-05-07 - return_reverse_core Shopee/Lazada ledger

### Việc đã làm

- Mở rộng `apps/worker-api/src/core/return-reverse-core.js` để chuẩn hóa Shopee Returns và Lazada Reverse/Return vào ledger chung `marketplace_return_reverse_ledger`.
- Bổ sung cột tương thích ngược `source_detail` và `source_updated_at`, thêm index lifecycle để dashboard/profit đọc nhanh hơn.
- Bổ sung API đọc ledger `/api/returns/ledger` và `/api/returns/summary`.
- Nâng route sync Shopee/Lazada để trả số dòng ledger, số hoàn đã chốt tài chính, số tiền hoàn và số đơn bị ảnh hưởng.
- Nối Profit Dashboard tab Hủy/Hoàn với ledger hoàn trả: có nút sync Shopee 24h, sync Lazada 30 ngày, tải ledger và ghi chú nguồn dữ liệu API/browser/import/manual.

### Đã kiểm tra thực tế

- `node --check` đã pass cho core, route sync, route returns và `cancel.js`.
- Worker local `/api/returns/ledger?limit=2` trả `status=ok`.
- Worker production đã deploy version `58c7cfc9-dd70-4ddf-98ac-07c4630eff90`.
- Frontend production đã deploy version `f846807a-5fc9-43a0-9fc3-9c4980f21f25`.
- Production `/api/returns/ledger?limit=3` trả `status=ok`.
- Production Shopee safe sync 1 giờ: `shop_count=2`, `ok_count=2`, `fetched_returns=0`, không có warning.
- Production Lazada safe sync 1 ngày: `shop_count=1`, `ok_count=1`, `fetched_returns=0`, không có warning; route đã sửa để nhận đúng `days=1`.
- Production Chrome profile `ProductionAdminTest` sau khi admin đăng nhập đã mở thẳng `profit-dashboard#cancel`, không bị chuyển về login.
- UI tab Hủy/Hoàn: bấm `Tải ledger` gọi `/api/returns/ledger?from=2026-05-07&to=2026-05-07&limit=12` trả HTTP 200, `mode=return_reverse_ledger_summary`, `ledger_rows=0`.
- UI tab Hủy/Hoàn: bấm `Đồng bộ Shopee 24h` gọi `/api/returns/shopee/sync` trả HTTP 200, `fetched_returns=0`, `ledger_saved=0`, `warnings=0`.
- UI tab Hủy/Hoàn: bấm `Đồng bộ Lazada 30 ngày` gọi `/api/returns/lazada/sync` trả HTTP 200, `fetched_returns=0`, `ledger_saved=0`, `warnings=0`.
- UI tab Lãi ròng: bấm `Tải dữ liệu` gọi `/api/order-analytics?from=2026-05-07&to=2026-05-07&limit=120` trả HTTP 200 và hiển thị nguồn `Core tài chính`.

### Trạng thái phase

- `Đã xong`: backend/core/API ledger Return/Reverse cho Shopee và Lazada, deploy Worker, deploy frontend, kiểm sync production ở chế độ an toàn, kiểm UI production sau đăng nhập.
- `Đang làm dở`: không còn mục UI mở trong `return_reverse_core`; phần payout/payment thật chuyển sang phase finance mở rộng.
- `Chưa làm`: đối soát payout/thuế đầy đủ theo statement chính thức của sàn.
- `Bị khóa an toàn`: không có lệnh ghi nguy hiểm lên sàn; phase này chỉ đọc/sync dữ liệu hoàn trả.
- `Bị chặn bởi quyền/app`: chưa gặp lỗi quyền trong safe sync; nếu shop mới thiếu quyền Returns/Reverse thì route sẽ ghi warning theo shop.

### Shop có API

- Shopee có API: đọc Shopee Returns, chuẩn hóa vào ledger chung, chỉ `is_finance_closed=1` mới trừ vào phần hoàn tiền đã chốt.
- Lazada có API: đọc Lazada Reverse/Return, detail/history khi bật, chuẩn hóa vào ledger chung, chỉ trạng thái tài chính đã chốt mới trừ vào profit.

### Shop không có API

- Không gắn nhãn API sync.
- Fallback theo `browser_sync`, `import_file_sync` hoặc `manual_reference`; dữ liệu phải có nguồn riêng để dashboard biết là tham chiếu, không phải dữ liệu Open Platform.

### Bước tiếp theo

- Khi có đơn hoàn/trả thật phát sinh, lọc lại ngày có dữ liệu để xác nhận bảng ledger hiển thị dòng chi tiết và số hoàn đã chốt tài chính.
- Tiếp tục phase kế tiếp theo thứ tự: cấp/kiểm quyền Lazada Finance transaction detail; adapter đã nối vào `order_finance_core`.

## 2026-05-07 - order_finance_core, marketplace_push_core, inventory_stock_core Lazada nâng cao

### Việc đã làm

- Tạo `apps/worker-api/src/core/order-finance-core.js` để gom `order_analytics`, `order_fee_details`, `marketplace_return_reverse_ledger` và Ads snapshot vào một core tài chính đơn hàng.
- Nối API `/api/order-analytics/finance-core` và thêm snapshot D1 `marketplace_order_finance_daily_snapshots` cho báo cáo ngày/tháng.
- Tạo `apps/worker-api/src/core/marketplace-push-core.js` để phân nhóm push/webhook, coverage event và API đọc `/api/webhooks/events?core=1`.
- Mở rộng `apps/worker-api/src/core/inventory-stock-core.js` cho Lazada advanced stock: `stock_source_json`, `warehouse_stock`, `channel_stock`, `fbl_stock`, `stock_source_detail`.
- Nối API `/api/products/inventory-stock-core` và cho Lazada product sync lưu nguồn tồn nâng cao nếu API trả `multiWarehouseInventories`, `channelInventories` hoặc FBL stock.
- Nối ghi chú `Core tài chính` vào tab Lãi ròng để người vận hành thấy rõ dữ liệu đang đọc từ core.

### Đã kiểm tra thực tế

- `node --check` đã pass cho các core/routes/frontend JS đã sửa.
- Worker local trả 200 cho:
  - `/api/order-analytics/finance-core`
  - `/api/webhooks/events?core=1`
  - `/api/products/inventory-stock-core`
- Worker production deploy version `3fec923a-2c1a-454a-93ea-7067d8299c66`.
- Frontend production deploy version `00172622-a208-456c-91bb-c82d26ee0ac8`.
- Production `/api/order-analytics/finance-core?limit=3` trả `status=ok`, `mode=order_finance_core`.
- Production rebuild order analytics 30 ngày trả `orders=1925`, `saved=1925`, snapshot tài chính D1 `saved=161`, không warning.
- Sau rebuild, `/api/order-analytics/finance-core?limit=3&days=30` đọc được `orders=1959`, `payment_api_orders=231`, `estimated_orders=1583`, `daily_snapshots=161`.
- Production `/api/webhooks/events?core=1&limit=3` trả `status=ok`, coverage `33` event, `14` đã xong, `11` đang làm dở, `8` chưa làm.
- Production `/api/products/inventory-stock-core?limit=3` trả `status=ok`.
- Production Lazada product sync giới hạn `limit=1` trả `fetched_products=1`, `synced_products=1`, `synced_variations=2`, không warning.
- Sau sync, Lazada inventory core đọc được `268` variation; hiện `advanced_stock_rows=0` vì payload production đang là `seller_quantity`, chưa có multiWarehouse/channel/FBL thực tế.
- Production `profit-dashboard.html` trả HTTP 200 và đã có cache bust `order-finance-core-20260507`.

### Trạng thái phase

- `Đã xong`: `order_finance_core` route/snapshot, Lazada Finance adapter/route, `marketplace_push_core` route/coverage, `inventory_stock_core` Lazada advanced columns/route, deploy Worker, deploy frontend.
- `Đang làm dở`: push subscription đầy đủ; Lazada stock advanced cần payload thật có multiWarehouse/channel/FBL để xác nhận.
- `Chưa làm`: đăng ký push event đầy đủ trên Open Platform; dashboard UI riêng cho stock advanced nếu cần vận hành sâu; đối soát payout/statement theo kỳ.
- `Bị khóa an toàn`: chưa mở lệnh update stock/update price thật lên sàn; chỉ sync đọc dữ liệu và ghi D1.
- `Bị chặn bởi quyền/app`: Lazada `/finance/transaction/detail/get` đã xác nhận bị chặn quyền app; chưa xác nhận subscription event push đầy đủ.

### Shop có API

- Shop có API chạy được:
  - Shopee/Lazada return ledger đọc bằng API.
  - Order finance đọc từ `order_analytics`, fee/payment đã lưu và return ledger.
  - Push/webhook có core phân nhóm để sync order/product/label/chat theo event.
  - Lazada product API sync ghi tồn seller quantity và sẵn cột advanced nếu API trả thêm warehouse/channel/FBL.

### Shop không có API

- Không nhận push chính thức và không gắn nhãn API sync.
- Fallback tiếp tục là `browser_sync`, `import_file_sync`, `manual_reference`; các màn hình phải hiện rõ đây là dữ liệu tham chiếu, không phải Open Platform.

### Vấn đề để mai tiếp tục

- Cấp/kiểm quyền Lazada Finance cho `/finance/transaction/detail/get`; adapter đã nối vào `order_finance_core` nhưng production app đang bị chặn quyền.
- Đăng ký/đối chiếu subscription event push còn thiếu cho Shopee và Lazada.
- Kiểm payload Lazada sản phẩm có shop nào trả `multiWarehouseInventories`, `channelInventories`, FBL stock; nếu không có thì ghi rõ bị chặn bởi quyền/app.
- Làm dashboard nhỏ cho stock advanced khi đã có payload thật, tránh chỉ xem qua API JSON.
- Khi có đơn hoàn/trả thật, lọc lại tab Hủy/Hoàn theo ngày có dữ liệu để kiểm hiển thị dòng ledger chi tiết và số hoàn đã trừ.

## 2026-05-07 - Lazada Finance/LazPay adapter vào order_finance_core

### Việc đã làm

- Thêm adapter Lazada Finance trong `apps/worker-api/src/routes/api-sync.js` cho:
  - `/finance/transaction/detail/get`
  - `/finance/payout/status/get`
- Thêm route vận hành:
  - `GET/POST /api/income/lazada/transactions`
  - `POST /api/income/lazada/transactions/sync`
  - `GET/POST /api/income/lazada/payout-status`
- `transaction detail` khi app có quyền sẽ gom theo `order_no`, lưu vào `order_fee_details` với nguồn `lazada.finance.transaction.detail.get`, rồi `rebuild_order_analytics` đọc lại vào `order_finance_core`.
- Cập nhật `order_finance_core` để đếm riêng `lazada_finance_orders`, đồng thời vẫn giữ `payment_api_orders` là tổng nguồn tiền thật từ Shopee Payment + Lazada Finance.
- Cập nhật tab Lãi ròng để ghi rõ nguồn Payment đang gồm Shopee Payment và Lazada Finance.

### Đã kiểm tra thực tế

- `node --check` pass cho `api-sync.js`, `income.js`, `order-analytics.js`, `order-finance-core.js`, `order-analytics.js` frontend.
- Worker deploy version `643cd939-154b-4ed9-9aea-28ce4bca3ec6`.
- Frontend deploy version `06a252f2-8e06-4fce-9086-8997337d1fb4`.
- Production `GET /api/income/lazada/payout-status?date_from=2026-05-07&date_to=2026-05-07&shop_limit=5` trả HTTP 200, `ok_count=1`, `total_rows=0`, không warning.
- Production `POST /api/income/lazada/transactions/sync` trả HTTP 200 nhưng `ok_count=0`, warning shop `kinhdoanhonlinegiasoc@gmail.com`: `App does not have permission to access this api`.
- Production `POST /api/order-analytics/rebuild` với `platform=lazada`, `sync_payment=true` trả HTTP 200 và ghi warning quyền Lazada Finance thay vì tạo số fallback.
- UI production bằng profile admin `ProductionAdminTest`: tab Lãi ròng dùng script cache `lazada-finance-core-20260507`, bấm `Đồng bộ Payment + tính lại` trả HTTP 200, hiển thị nguồn `Shopee /api/v2/payment/get_income_detail và Lazada /finance/transaction/detail/get`.

### Trạng thái phase

- `Đã xong`: adapter/route Lazada Finance, nối nguồn vào `order_fee_details`, `order_analytics`, `order_finance_core`, deploy Worker/frontend, kiểm UI production.
- `Đang làm dở`: chưa có dòng transaction detail Lazada thật vì app chưa được cấp quyền endpoint finance transaction.
- `Chưa làm`: đối soát payout/statement theo kỳ và báo cáo thuế chính thức.
- `Bị khóa an toàn`: không ghi lệnh tài chính lên sàn; chỉ đọc Finance API và lưu snapshot nội bộ.
- `Bị chặn bởi quyền/app`: `/finance/transaction/detail/get` đang bị chặn bởi quyền app; cần cấp quyền Lazada Finance/LazPay cho app đang dùng.

### Shop có API

- Lazada có API: payout status gọi được bằng API, transaction detail đã có adapter nhưng app hiện chưa có quyền nên chưa ghi được số finance thật vào core.
- Shopee có API: vẫn chạy Shopee Payment như trước, không bị ảnh hưởng.

### Shop không có API

- Không gắn nhãn Lazada Finance API.
- Fallback tiếp tục là `import_file_sync`, `browser_sync` hoặc `manual_reference`, và phải hiển thị là dữ liệu tham chiếu, không dùng để chốt thuế nếu chưa có statement chính thức.

### Bước tiếp theo

- Cấp/kiểm quyền Lazada Finance cho endpoint `/finance/transaction/detail/get`, sau đó chạy lại `POST /api/income/lazada/transactions/sync` theo ngày có đơn thật.
- Chuyển sang phase kế tiếp trong ưu tiên 1: `marketplace_push_core` đăng ký/đối chiếu subscription event đầy đủ cho Shopee và Lazada.

## 2026-05-07 - marketplace_push_core subscription/callback probe

### Việc đã làm

- Mở rộng `apps/worker-api/src/core/marketplace-push-core.js` với API subscription status cho từng event push.
- `GET /api/webhooks/events?core=1&subscriptions=1` đọc coverage + event đã nhận trong 30 ngày.
- `GET /api/webhooks/events?core=1&subscriptions=1&probe=1` gọi read-only Shopee `/api/v2/push/get_app_push_config` để đối chiếu callback, live push status, on/off event list theo từng partner app.
- Route webhook vẫn chỉ ghi nhận callback và phân nhóm event; chưa tự gửi lệnh ghi `set_app_push_config`.
- Lazada được tách rõ là cần verify callback + subscribe message type trong LazOP Message Service/console theo tài liệu Push Mechanism.

### Đã kiểm tra thực tế

- `node --check` pass cho:
  - `apps/worker-api/src/core/marketplace-push-core.js`
  - `apps/worker-api/src/routes/marketplace-webhooks.js`
- `npx wrangler deploy --dry-run` pass.
- Worker production deploy version `f7a68f3f-3fd3-4bb3-84e5-c5a4066f2f59`.
- Production `/api/webhooks/events?core=1&subscriptions=1&limit=5` trả `status=ok`, `total_events=33`, `observed_recent=12`.
- Production `/api/webhooks/events?core=1&subscriptions=1&probe=1&limit=5` trả:
  - Shopee đọc được `2` app config.
  - Callback Shopee đang là `https://huyvan-worker-api.nghiemchihuy.workers.dev/api/webhooks/shopee`.
  - `live_push_status=Normal`, `api_probe_failed=0`.
  - `12` event đã nhận push thật trong 30 ngày.
  - `6` event Shopee đã bật đủ theo API.
  - `9` event Shopee bật một phần giữa các partner app.
  - `0` event Shopee đang tắt toàn bộ theo API.
  - `6` nhóm Lazada còn cần kiểm/subscription trong LazOP Message Service.
- Production callback test:
  - `GET /api/webhooks/shopee?challenge=codex-push-check` trả HTTP 200 và body challenge.
  - `GET /api/webhooks/lazada?challenge=codex-push-check` trả HTTP 200 và body challenge.
  - `HEAD /api/webhooks/shopee?challenge=codex-push-check-2` trả HTTP 200.
  - `HEAD /api/webhooks/lazada?challenge=codex-push-check-2` trả HTTP 200.

### Trạng thái phase

- `Đã xong`: API subscription/callback status, Shopee push config probe read-only, deploy Worker, kiểm callback production.
- `Đang làm dở`: Shopee còn `9` event bật một phần vì có partner app bật, partner app khác tắt; cần quyết định shop dưới partner tắt có cần realtime không.
- `Chưa làm`: subscribe đủ Lazada Message Service cho order, reverse, product/stock, video/auth/review/IM; nối sâu hơn push product/return vào incremental sync theo từng payload thật.
- `Bị khóa an toàn`: chưa gọi `set_app_push_config`, chưa đổi cấu hình app push trên sàn.
- `Bị chặn bởi quyền/app`: Lazada subscription hiện phải thao tác trong LazOP Message Service/console; OMS chỉ xác nhận callback nhận 200.

### Shop có API

- Shopee có API: OMS đã đọc được cấu hình Push chính thức, callback đúng, live push `Normal`; event đã nhận push thật được đánh dấu từ `marketplace_webhook_events`.
- Lazada có API: webhook endpoint sẵn sàng và callback trả 200; còn phải vào LazOP Message Service để verify/subscribe message type theo từng nhóm.

### Shop không có API

- Không có push chính thức từ sàn.
- Fallback tiếp tục là `browser_sync`, `import_file_sync`, `manual_reference`; UI/route không được gắn nhãn realtime API cho shop này.

### Vấn đề để mai tiếp tục

- Kiểm partner app Shopee `2032989`: các event order/stock/product/video/auth cũ đang off một phần; nếu shop dưới partner này cần realtime thì bật đồng nhất bằng `set_app_push_config` sau khi có preview payload và log.
- Vào LazOP Message Service/console subscribe các nhóm Lazada còn thiếu cho callback `/api/webhooks/lazada`.
- Sau khi Lazada có push thật, kiểm lại `/api/webhooks/events?core=1&subscriptions=1&probe=1` để số `observed_recent` tăng và nhóm Lazada không còn chỉ là console pending.
- Nối tiếp ưu tiên còn lại: `inventory_stock_core` bản Lazada nâng cao, kiểm payload `multiWarehouseInventories`, `channelInventories`, FBL stock thực tế.

## 2026-05-07 - inventory_stock_core Lazada FBL/advanced probe

### Việc đã làm

- Mở rộng `apps/worker-api/src/core/inventory-stock-core.js` để chuẩn hóa thêm nguồn Lazada FBL:
  - `store_stocks[].stocks.sellable.available` từ `/fbl/stocks/getV3`
  - `stocks[].channel_stocks[].quantity` từ `/fbl/channel_stocks/get`
  - merge vào `stock_source_json`, `warehouse_stock`, `channel_stock`, `fbl_stock`, `stock_source_detail`
- Mở rộng `apps/worker-api/src/routes/api-sync.js`:
  - `include_fbl_stock=1` khi sync Lazada product sẽ gọi read-only `/fbl/platform_products/get2`
  - nếu có fulfillment SKU thì gọi tiếp `/fbl/stocks/getV3`
  - channel stock giới hạn bằng `fbl_channel_limit` để tránh gọi quá nhiều request
- Giữ nguyên khóa an toàn: không gọi endpoint update tồn, không đẩy tồn thật lên sàn.

### Đã kiểm tra thực tế

- `node --check` pass cho:
  - `apps/worker-api/src/core/inventory-stock-core.js`
  - `apps/worker-api/src/routes/api-sync.js`
- `npx wrangler deploy --dry-run` pass.
- Worker production deploy version `c7b31e8d-2338-4b9e-9b8d-af76da536603`.
- Production `POST /api/products/sync-api-products` với `platform=lazada`, `limit=2`, `include_out_of_stock=true`, `include_fbl_stock=true`, `fbl_limit=5`, `fbl_channel_limit=2`, `marketplace=LAZADA_VN` trả HTTP 200:
  - `fetched_products=2`
  - `synced_products=2`
  - `synced_variations=3`
  - `saved_product_knowledge=2`
  - `saved_product_catalog_snapshots=2`
  - FBL probe gọi được và không warning.
  - `seller_id=200166591213`
  - `platform_products=0`, `sku_rows=0`, `stock_rows=0`, `channel_rows=0`, `enriched_variations=0`
- Production `/api/products/inventory-stock-core?limit=5` trả:
  - `lazada_variations=268`
  - `advanced_stock_rows=0`
  - `warehouse_rows=0`
  - `channel_rows=0`
  - `fbl_rows=0`
  - sample vẫn là `stock_source_detail=seller_quantity`

### Trạng thái phase

- `Đã xong`: core/cột/route tồn Lazada nâng cao, FBL read-only adapter/probe, deploy Worker, kiểm production.
- `Đang làm dở`: chưa có dòng advanced thật vì shop Lazada production không trả FBL/platform product binding và `/products/get` hiện vẫn là seller quantity.
- `Chưa làm`: dashboard riêng cho advanced stock nếu sau này có warehouse/channel/FBL payload thật.
- `Bị khóa an toàn`: mọi lệnh update stock/update price thật vẫn khóa; phase này chỉ đọc API và lưu snapshot.
- `Bị chặn bởi dữ liệu thực tế`: chưa có sản phẩm Lazada đang bind FBL/warehouse/channel để xác nhận dòng advanced khác `seller_quantity`.

### Shop có API

- Lazada có API: sync sản phẩm vẫn chạy, đã có thêm probe FBL read-only. Nếu sau này shop có fulfillment SKU/FBL binding, dữ liệu sẽ được merge vào `inventory_stock_core`.
- Shopee có API: không bị ảnh hưởng trong phase này.

### Shop không có API

- Không có nguồn tồn nâng cao từ sàn.
- Fallback là `manual_reference`, `import_file_sync` hoặc browser hỗ trợ có log; không gắn nhãn FBL/API advanced.

### Vấn đề để mai tiếp tục

- Tạo hoặc tìm shop/sản phẩm Lazada có FBL/warehouse/channel binding thật, sau đó chạy lại `include_fbl_stock=1`.
- Nếu vẫn `platform_products=0`, ghi rõ đây là giới hạn dữ liệu shop hiện tại, không phải lỗi code.
- Mục ưu tiên tiếp theo sau nhóm dữ liệu sống còn: `promotion_tool_core` hoặc xử lý nốt Shopee/Lazada push subscription pending.

## 2026-05-07 - promotion_tool_core API tổng hợp đa sàn

### Việc đã làm

- Tạo `apps/worker-api/src/core/promotion-tool-core.js`.
- Nối API:
  - `GET /api/discounts/promotion-tool-core`
  - alias `GET /api/discounts/core`
- Core gom các nguồn hiện có:
  - `marketplace_discounts`
  - `marketplace_discount_items`
  - `marketplace_webhook_events` cho `item_promotion_push`, `promotion_update_push`
  - `marketplace_ads_campaign_snapshots`
  - `order_fee_details` voucher fields nếu có
  - `marketplace_product_knowledge.promotion_summary`
- Core phân tách rõ endpoint coverage:
  - Shopee Discount: đã có sync read-only + action guard.
  - Shopee Voucher, Bundle Deal, Add-On Deal, ShopFlashSale: đã map endpoint docs, chưa mở sync/ghi.
  - Lazada Seller Voucher, Free Shipping, Flexicombo, Early Bird: đã map endpoint docs, chưa mở sync/ghi.
- Giữ khóa an toàn: core mới chỉ đọc/tổng hợp, không tự tạo/sửa/kích hoạt/tắt khuyến mãi thật.

### Đã kiểm tra thực tế

- `node --check` pass cho:
  - `apps/worker-api/src/core/promotion-tool-core.js`
  - `apps/worker-api/src/routes/discounts.js`
- `npx wrangler deploy --dry-run` pass.
- Worker production deploy version `44515f34-627c-4d02-b832-48cb70a84fd8`.
- Production `GET /api/discounts/promotion-tool-core?limit=5` trả:
  - `status=ok`
  - `mode=promotion_tool_core`
  - `endpointModules=9`
  - `done=1`
  - `pending=8`
  - `locked=8`
  - `apiActive=3`
  - `discounts=2`
  - `discountItems=357`
  - `activePromotions=2`
  - `pushTotal=3`
  - `adsOverlapRows=5`
- Production `GET /api/discounts/shopee/analysis?limit=5` trả:
  - `status=ok`
  - `discount_items=5`
  - `analysis_items=3`
  - `ads_campaigns=176`
  - Có dòng khuyến nghị `reduce_or_end_discount` cho SKU đang discount nhưng tồn thực tế bằng `0`.

### Trạng thái phase

- `Đã xong`: `promotion_tool_core` API tổng hợp, endpoint coverage đa sàn, kết nối dữ liệu Shopee Discount cache/ADS/tồn, deploy Worker, kiểm production.
- `Đang làm dở`: chưa có UI riêng cho promo chồng ADS/tồn; Shopee Discount action vẫn cần guard như cũ.
- `Chưa làm`: Shopee Voucher/Bundle/Add-On/Flash Sale sync read-only; Lazada Voucher/Free Shipping/Flexicombo sync read-only; preview payload đa sàn trước khi apply thật.
- `Bị khóa an toàn`: toàn bộ thao tác tạo/sửa/kích hoạt/tắt khuyến mãi thật vẫn khóa nếu chưa có preview, quyền admin và log.
- `Bị chặn bởi quyền/app`: chưa probe quyền Lazada Promotion API và Shopee Voucher/Bundle/Add-On theo shop thật.

### Shop có API

- Shopee có API: đã đọc được Discount cache và phân tích chồng ADS/tồn; các module promotion khác mới ở mức endpoint coverage.
- Lazada có API: mới có endpoint coverage theo docs, chưa gọi API promotion thật.

### Shop không có API

- Không tạo/sửa khuyến mãi bằng Open Platform.
- Fallback là dữ liệu tham chiếu từ đơn/report/import/browser có log; không gắn nhãn API promotion.

### Vấn đề để mai tiếp tục

- Nối read-only Shopee Voucher trước vì cùng nhóm Marketing và ít rủi ro hơn write.
- Sau đó nối Lazada Seller Voucher list để kiểm quyền app production.
- Làm UI nhỏ cho `promotion_tool_core`: SKU discount + đang chạy ADS + tồn thấp/cao.
- Chỉ mở thao tác apply thật sau khi có preview payload, kiểm lợi nhuận/tồn và log kết quả.

## 2026-05-07 - Shopee Voucher read-only vào promotion_tool_core

### Việc đã làm

- Mở rộng `apps/worker-api/src/routes/discounts.js`:
  - tạo bảng cache `marketplace_vouchers`
  - thêm route `POST /api/discounts/shopee/vouchers/sync`
  - alias `POST /api/discounts/vouchers/sync`
  - gọi read-only Shopee `/api/v2/voucher/get_voucher_list`
  - gọi detail read-only `/api/v2/voucher/get_voucher` theo `detail_limit`
- Mở rộng `apps/worker-api/src/core/promotion-tool-core.js`:
  - thêm summary `summary.shopee_vouchers`
  - đánh dấu module Shopee `Voucher` là `đã xong`
  - giữ `safe_status=write_locked` cho các endpoint tạo/sửa/xóa/kết thúc voucher thật.
- Chỉnh cache voucher: nếu sync `status=all` mà Shopee còn `has_more=true`, không đánh dấu toàn bộ cache cũ là stale vì lượt này mới kéo một phần.
- Chỉnh status voucher: khi Shopee không trả status riêng cho request `all`, OMS suy luận `expired/upcoming/ongoing` từ `start_time/end_time`.

### Đã kiểm tra thực tế

- `node --check` pass cho:
  - `apps/worker-api/src/routes/discounts.js`
  - `apps/worker-api/src/core/promotion-tool-core.js`
- `npx wrangler deploy --dry-run` pass.
- Worker production deploy version cuối: `6356e995-851d-457b-b48d-7533f26b349c`.
- Production `POST /api/discounts/shopee/vouchers/sync` với `status=ongoing`, `page_limit=1`, `detail_limit=20`, `shop_limit=5` trả:
  - `status=ok`
  - `shop_count=2`
  - `ok_count=2`
  - `total_vouchers=0`
  - `detail_count=0`
  - không lỗi quyền/app.
- Production `POST /api/discounts/shopee/vouchers/sync` với `status=all`, `page_limit=1`, `detail_limit=5`, `shop_limit=5` trả:
  - `status=ok`
  - `shop_count=2`
  - `ok_count=2`
  - `total_vouchers=200`
  - `detail_count=10`
  - `saved_vouchers=210`
  - cả 2 shop đều `has_more=true`, nghĩa là mới cache trang đầu.
- Production `GET /api/discounts/promotion-tool-core?limit=5` trả:
  - `status=ok`
  - `endpointModules=9`
  - `done=2`
  - `pending=7`
  - `locked=8`
  - `shopeeVouchers=200`
  - `activeVouchers=0`
  - `voucherUsage=18319`
  - `itemBoundVouchers=4`
  - `voucherShops=2`
  - `voucherStatusRows=expired:200`
  - `adsOverlapRows=5`

### Trạng thái phase

- `Đã xong`: Shopee Voucher read-only sync, cache D1, detail probe có giới hạn, summary trong `promotion_tool_core`, deploy Worker, kiểm production.
- `Đang làm dở`: mới cache trang đầu `status=all`; nếu cần đủ lịch sử voucher phải chạy batch nhiều trang theo `page_limit` cao hơn hoặc lịch cron riêng.
- `Chưa làm`: Shopee Bundle/Add-On/Flash Sale read-only; Lazada Seller Voucher/Free Shipping/Flexicombo read-only; UI promotion riêng.
- `Bị khóa an toàn`: tất cả endpoint tạo/sửa/xóa/kết thúc voucher thật vẫn khóa, chưa có route apply.
- `Bị chặn bởi quyền/app`: chưa thấy lỗi quyền với Shopee Voucher; Lazada Promotion API chưa probe production.

### Shop có API

- Shopee có API: đọc được `Voucher` chính thức bằng Open Platform, lưu cache `marketplace_vouchers`, core tổng hợp được số voucher và usage.
- Lazada có API: chưa gọi Promotion API thật trong phase này.

### Shop không có API

- Không có sync voucher bằng Open Platform.
- Fallback là dữ liệu tham chiếu từ đơn/report/import/browser có log; không gắn nhãn tạo/sửa voucher API.

### Vấn đề để mai tiếp tục

- Chạy batch Shopee Voucher đủ trang cho `status=all` nếu cần lịch sử đầy đủ, vì production hiện cả 2 shop đều `has_more=true`.
- Nối Lazada Seller Voucher list để kiểm quyền app production.
- Nối Shopee Bundle/Add-On/Flash Sale ở chế độ read-only trước khi nghĩ tới apply thật.
- Làm UI nhỏ cho `promotion_tool_core`: SKU discount/voucher + đang chạy ADS + tồn thấp/cao.

## 2026-05-07 - Lazada Seller Voucher read-only vào promotion_tool_core

### Việc đã làm

- Export helper `callLazadaWithShop` từ `apps/worker-api/src/routes/api-sync.js` để dùng lại luồng ký request, refresh token và thông báo lỗi quyền/token đã có.
- Mở rộng `apps/worker-api/src/routes/discounts.js`:
  - thêm route `POST /api/discounts/lazada/vouchers/sync`
  - gọi read-only Lazada `/promotion/vouchers/get`
  - gọi detail read-only `/promotion/voucher/get`
  - gọi selected product read-only `/promotion/voucher/products/get` theo giới hạn `product_page_limit`
  - lưu chung vào `marketplace_vouchers` với `platform=lazada`
- Mở rộng `apps/worker-api/src/core/promotion-tool-core.js`:
  - thêm summary `summary.lazada_vouchers`
  - tách summary Shopee/Lazada theo `platform`
  - đánh dấu module Lazada `Seller Voucher API` là `đã xong`
  - giữ `safe_status=write_locked` cho endpoint tạo/sửa/kích hoạt/tắt voucher thật.

### Đã kiểm tra thực tế

- `node --check` pass cho:
  - `apps/worker-api/src/routes/discounts.js`
  - `apps/worker-api/src/core/promotion-tool-core.js`
  - `apps/worker-api/src/routes/api-sync.js`
- `npx wrangler deploy --dry-run` pass.
- Worker production deploy version: `f5971996-afc1-4504-8c92-0ccc189bf16f`.
- Production `POST /api/discounts/lazada/vouchers/sync` với `status=all`, `page_limit=1`, `detail_limit=5`, `product_page_limit=1`, `shop_limit=5` trả:
  - `status=ok`
  - `shop_count=1`
  - `ok_count=1`
  - `total_vouchers=42`
  - `detail_count=5`
  - `product_rows=4`
  - `saved_vouchers=47`
  - shop `kinhdoanhonlinegiasoc@gmail.com` không lỗi quyền/app.
- Production `GET /api/discounts/promotion-tool-core?limit=5` trả:
  - `status=ok`
  - `endpointModules=9`
  - `done=3`
  - `pending=6`
  - `locked=8`
  - `shopeeVouchers=200`
  - `lazadaVouchers=42`
  - `lazadaActiveVouchers=0`
  - `lazadaVoucherUsage=22017`
  - `lazadaItemBoundVouchers=3`
  - `lazadaVoucherShops=1`
  - `lazadaVoucherStatus=expired:42`
- Sau deploy cuối, chạy lại Production `POST /api/discounts/shopee/vouchers/sync` với `status=all`, `page_limit=1`, `detail_limit=2`, `shop_limit=5` trả `status=ok`, `shop_count=2`, `ok_count=2`, `total_vouchers=200`, `detail_count=4`, `saved_vouchers=204`, `has_more_shops=2`.
- Production `GET /api/discounts/promotion-tool-core?limit=5` sau lượt kiểm cuối trả `done=3`, `pending=6`, `locked=8`, `shopeeVouchers=200`, `lazadaVouchers=42`, `adsOverlapRows=5`.

### Trạng thái phase

- `Đã xong`: Lazada Seller Voucher read-only sync, detail/product probe có giới hạn, cache D1, summary trong `promotion_tool_core`, deploy Worker, kiểm production.
- `Đang làm dở`: chưa có UI promotion riêng; chưa nối Free Shipping/Flexicombo.
- `Chưa làm`: Lazada Free Shipping/Flexicombo read-only; Shopee Bundle/Add-On/Flash Sale read-only; UI promotion chồng ADS/tồn.
- `Bị khóa an toàn`: tất cả thao tác tạo/sửa/kích hoạt/tắt voucher Lazada thật vẫn khóa, chưa có route apply.
- `Bị chặn bởi quyền/app`: chưa thấy lỗi quyền với Lazada Seller Voucher; các module Lazada Promotion khác chưa probe.

### Shop có API

- Lazada có API: đọc được Seller Voucher chính thức, cache `marketplace_vouchers`, core tổng hợp được số voucher và selected products.
- Shopee có API: vẫn giữ kết quả Discount + Voucher read-only từ phase trước.

### Shop không có API

- Không có sync Lazada Voucher bằng Open Platform.
- Fallback là dữ liệu tham chiếu từ đơn/report/import/browser có log; không gắn nhãn tạo/sửa voucher API.

### Vấn đề để mai tiếp tục

- Nối Lazada Free Shipping API read-only để kiểm quyền và vùng/đơn vị vận chuyển.
- Nối Lazada Flexicombo API read-only để chuẩn bị mô phỏng combo theo SKU.
- Nối Shopee Bundle/Add-On/Flash Sale read-only.
- Làm UI nhỏ cho `promotion_tool_core`: SKU discount/voucher + đang chạy ADS + tồn thấp/cao.
- Khi cần đủ lịch sử Shopee Voucher, chạy batch nhiều trang vì 2 shop Shopee đang `has_more=true`.

## 2026-05-07 - Promotion read-only batch và UI khuyến mãi sàn

### Việc đã làm

- Mở rộng `apps/worker-api/src/routes/discounts.js`:
  - thêm cache chung `marketplace_promotion_programs`
  - thêm cache item/SKU `marketplace_promotion_items`
  - thêm route `POST /api/discounts/shopee/promotions/sync`
  - thêm route `POST /api/discounts/lazada/promotions/sync`
  - Shopee đọc read-only `Bundle Deal`, `Add-On Deal`, `ShopFlashSale`
  - Lazada đọc read-only `Free Shipping API`, `Flexicombo API`
- Mở rộng `apps/worker-api/src/core/promotion-tool-core.js`:
  - thêm summary `summary.shopee_programs`
  - thêm summary `summary.lazada_programs`
  - đánh dấu 8/9 module endpoint promotion là `đã xong`
  - giữ `safe_status=write_locked` cho toàn bộ thao tác ghi thật.
- Mở rộng ADS page:
  - thêm panel `Khuyến mãi sàn` trong `apps/fe/pages/ads.html`
  - thêm `loadPromotionCore()` và `syncPromotionCoreCache()` trong `apps/fe/js/dashboard/ads.js`
  - UI hiển thị voucher, bundle/add-on/flash, freeship/flexicombo và SKU đang giảm giá + ADS + tồn.
- Batch Shopee Voucher đủ trang cho 2 shop đang có API:
  - `chihuy2309`: `299` voucher, `3` trang, `has_more=false`
  - `chihuy1984`: `422` voucher, `5` trang, `has_more=false`
  - tổng cache Shopee Voucher sau batch: `721`

### Đã kiểm tra thực tế

- `node --check` pass cho:
  - `apps/worker-api/src/routes/discounts.js`
  - `apps/worker-api/src/core/promotion-tool-core.js`
  - `apps/worker-api/src/routes/api-sync.js`
  - `apps/fe/js/dashboard/ads.js`
- Worker API:
  - `npx wrangler deploy --dry-run` pass
  - deploy production version `0ecdd335-f3b9-4072-972a-ec44554c9f2f`
- Frontend/static:
  - `npx wrangler deploy --dry-run` pass
  - deploy production version `aaccd777-c6be-44e5-86c2-28f37d6c95be`
- Production `POST /api/discounts/shopee/promotions/sync`:
  - chạy batch theo module/shop để tránh giới hạn subrequest của Worker
  - cache cuối sau UI read-only: `309` chương trình Shopee và `328` dòng item/SKU
  - module hiện có:
    - `add_on_deal`: `155` chương trình
    - `bundle_deal`: `54` chương trình
    - `shop_flash_sale`: `100` chương trình
- Production `POST /api/discounts/lazada/promotions/sync`:
  - `free_shipping`: `2` chương trình
  - `flexicombo`: endpoint gọi thành công nhưng hiện `0` chương trình production
- Production `GET /api/discounts/promotion-tool-core?limit=5` sau kiểm cuối trả:
  - `status=ok`
  - `total_modules=9`
  - `done=8`
  - `pending=1`
  - `locked=8`
  - `shopeeVouchers=721`
  - `lazadaVouchers=42`
  - `shopeePrograms=309`
  - `shopeeProgramItems=328`
  - `lazadaPrograms=2`
  - `lazadaProgramItems=0`
  - `adsOverlapRows=5`
- UI production bằng Chrome profile kiểm thử:
  - đăng nhập admin thành công, mở `ADS quảng cáo`
  - panel `Khuyến mãi sàn` hiển thị `8/9 module đã nối · 8 module khóa ghi thật`
  - desktop không tràn ngang, có `4` KPI, `4` card module và `12` dòng SKU rủi ro
  - mobile width `390px` không tràn ngang, vẫn thấy nút `Tải core khuyến mãi` và `Cập nhật cache read-only`
  - bấm luồng thật `Cập nhật cache read-only` trên UI, chạy khoảng `29s`, không có lỗi hiển thị.

### Trạng thái phase

- `Đã xong`: Shopee Voucher đủ trang, Shopee Bundle/Add-On/Flash Sale read-only, Lazada Free Shipping/Flexicombo read-only, UI khuyến mãi sàn trên ADS, deploy Worker + frontend, kiểm production bằng API và browser.
- `Đang làm dở`: Shopee Add-On/Flash Sale vẫn có khả năng còn nhiều trang lịch sử hơn cache UI; cần batch sâu hoặc cron riêng nếu muốn đủ toàn bộ lịch sử. Lazada Flexicombo endpoint ổn nhưng chưa có dữ liệu thật trong shop production.
- `Chưa làm`: Lazada Early Bird Price API, UI chi tiết theo từng chương trình, preview payload ghi thật đa sàn, cron batch sâu tự động.
- `Bị khóa an toàn`: tạo/sửa/kích hoạt/tắt voucher, bundle, add-on, flash sale, freeshipping, flexicombo thật vẫn khóa.
- `Bị chặn bởi quyền/app`: chưa thấy lỗi quyền với Shopee Voucher/Bundle/Add-On/Flash và Lazada Voucher/Free Shipping/Flexicombo trong lượt production này; Lazada Finance transaction detail ở phase khác vẫn còn lỗi quyền app.

### Shop có API

- Shopee có API: đồng bộ được Discount, Voucher, Bundle Deal, Add-On Deal, ShopFlashSale bằng Open Platform, lưu cache D1 và đọc lại trong `promotion_tool_core`.
- Lazada có API: đồng bộ được Seller Voucher, Free Shipping, Flexicombo read-only; Flexicombo hiện chưa có chương trình production để hiển thị item.

### Shop không có API

- Không gọi Open Platform để đồng bộ hoặc tạo/sửa promotion.
- Fallback là dữ liệu tham chiếu từ đơn hàng, report import hoặc browser hỗ trợ có log; UI không gắn nhãn “đồng bộ API” cho shop chưa có API.

### Vấn đề để mai tiếp tục

- Làm cron/batch sâu cho Shopee Voucher và Promotion Program theo từng shop/module để không phải bấm tay.
- Làm UI chi tiết drilldown từng voucher/program: chương trình, SKU, tồn, ADS, doanh thu và trạng thái.
- Làm preview payload ghi thật cho promotion nhưng vẫn khóa nút apply cho tới khi có quyền admin, rule lợi nhuận/tồn và log rollback.
- Nối hoặc xác nhận Lazada Early Bird Price API; do đây là endpoint ghi giá thật nên hiện vẫn khóa.
- Chuẩn hóa rule giá theo tồn kho thành core đa sàn, không chỉ nằm trong Shopee Discount/OMS.

## 2026-05-07 - ADS page con, promotion drilldown và preview khóa apply

### Việc đã làm

- Chia `apps/fe/pages/ads.html` thành các page con `Tổng quan / Guard ADS / TopPicks / Discount / Khuyến mãi sàn` để không phải kéo một trang ADS quá dài.
- Thêm UI `Khuyến mãi sàn`: lọc voucher/program theo sàn, module, trạng thái; mở chi tiết chương trình; xem item/SKU trong cache; dựng preview rule giá theo tồn kho nhưng vẫn khóa apply thật.
- Thêm `apps/worker-api/src/core/promotion-stock-price-rule-core.js` để chuẩn hóa rule giá theo tồn kho dùng chung: tồn dưới 10, tồn dưới 100, tồn từ 100 trở lên.
- Mở rộng `apps/worker-api/src/routes/discounts.js` với các route list/detail/voucher, batch sâu và preview action:
  - `GET/POST /api/discounts/promotion-cache/batch`
  - `GET/POST /api/discounts/promotions/deep-sync`
  - `GET/POST /api/discounts/promotion-programs`
  - `GET/POST /api/discounts/promotion-program-detail`
  - `GET/POST /api/discounts/promotion-vouchers`
  - `POST /api/discounts/promotions/preview-action`
  - `POST /api/discounts/promotion-action/preview`
- Thêm cron lát cắt trong Worker để chạy cache promotion sâu dần theo từng shop/module, tránh chạy một lượt lớn vượt quota subrequest.
- Sửa lỗi nhỏ trong lưu discount: fallback `vouchers?.[0]` được đổi đúng sang `discounts?.[0]`.

### Đã kiểm tra thực tế

- `node --check` pass cho:
  - `apps/worker-api/src/routes/discounts.js`
  - `apps/worker-api/src/core/promotion-stock-price-rule-core.js`
  - `apps/worker-api/src/index.js`
  - `apps/fe/js/dashboard/ads.js`
- Worker API:
  - `npx wrangler deploy --dry-run` pass
  - deploy production version `2fbc29dd-77b1-4792-8b23-402f717b2aea`
- Frontend/static:
  - `npx wrangler deploy --dry-run` pass
  - deploy production version cuối `971ffae1-ac5d-47a8-95b4-dda0da68bbdf`
- Production API `GET /api/discounts/promotion-tool-core?limit=5` trả:
  - `status=ok`
  - `total_modules=9`
  - `done=8`
  - `pending=1`
  - `locked=8`
  - `shopeePrograms=309`
  - `shopeeProgramItems=328`
  - `lazadaPrograms=2`
  - `shopeeVouchers=721`
  - `lazadaVouchers=42`
- Production API `GET /api/discounts/promotion-programs?platform=shopee&module=bundle_deal&limit=3` trả `3` dòng; dòng đầu shop `chihuy1984`, program `378212903895303`, `cached_items=5`.
- Production API `POST /api/discounts/promotion-cache/batch` với `task=lazada_flexicombo`, `max_jobs=1`, `shop_limit=1` trả `status=ok`, `selected_jobs=1`, `available_jobs=1`.
- Production API `POST /api/discounts/promotions/preview-action`:
  - với Shopee Bundle trả `status=ok`, `apply_locked=true`, `sent_to_platform=false`, payload generic có `target_promotion_price`.
  - với Lazada Early Bird trả preview endpoint `/activity/early/bird/create` và `/activity/early/bird/addSkus`, vẫn `apply_locked=true`.
- UI production bằng Chrome profile thật:
  - trang ADS nạp đúng `ads.js?v=ads-subpages-20260507`;
  - tab con `Khuyến mãi sàn` active;
  - chỉ panel `promotionCorePanel` hiển thị, các panel overview/guard/top-picks/discount bị ẩn;
  - danh sách Shopee Bundle hiển thị `54` dòng;
  - mở chi tiết chương trình đầu có `5` item;
  - preview giá theo tồn trả `Đã khóa apply thật`, `status=ok`, `sent_to_platform=false`;
  - mobile width `390px` có `scrollWidth=390`, không tràn ngang, không có console error.

### Trạng thái phase

- `Đã xong`: page con ADS, drilldown voucher/program, route list/detail/voucher, batch sâu thủ công, cron lát cắt, core preview giá theo tồn kho, deploy Worker + frontend, kiểm production bằng API và browser.
- `Đang làm dở`: cache sâu toàn bộ lịch sử promotion sẽ tiếp tục đầy dần theo cron; một số item Bundle/Add-On/Flash Sale đang thiếu giá gốc/giá KM từ API/cache nên chưa dùng để tính lợi nhuận chính xác.
- `Chưa làm`: apply thật lên sàn, rollback, quy trình duyệt admin trước khi đẩy giá/promotion thật.
- `Bị khóa an toàn`: tạo/sửa/kích hoạt/tắt voucher, bundle, add-on, flash sale, freeshipping, flexicombo và Early Bird thật.
- `Bị chặn bởi quyền/app`: chưa phát sinh lỗi quyền mới trong phase này; Lazada Early Bird vẫn được coi là endpoint ghi giá nên chỉ preview khóa, chưa apply.

### Shop có API

- Shopee có API: đọc được Discount, Voucher, Bundle Deal, Add-On Deal, ShopFlashSale; UI đọc cache chương trình/item và dựng payload preview khóa.
- Lazada có API: đọc được Seller Voucher, Free Shipping, Flexicombo; Early Bird mới dựng preview endpoint ghi giá và khóa apply.

### Shop không có API

- Không gọi Open Platform để đồng bộ hoặc tạo/sửa promotion.
- Fallback là dữ liệu tham chiếu từ đơn hàng, report import hoặc browser hỗ trợ có log; UI không gắn nhãn “đồng bộ API” cho shop chưa có API.

### Vấn đề để tiếp tục

- Làm hàng đợi duyệt apply thật: preview, kiểm tồn/lãi, quyền admin, log request/response, rollback.
- Làm sạch/mapping giá cho item promotion đang có `promotion_price/original_price=0`.
- Bổ sung màn hình chi tiết theo SKU để so sánh promotion + ADS + tồn + doanh thu trước khi mở apply.
- Xác nhận Lazada Early Bird có nên đưa vào vận hành hay chỉ giữ cảnh báo vì đây là endpoint ghi giá thật.

## 2026-05-07 - Promotion queue apply, SKU detail và làm sạch giá 0đ

### Việc đã làm

- Thêm route làm sạch cache promotion:
  - `POST /api/discounts/promotion-items/repair-prices`
  - alias `POST /api/discounts/promotions/repair-price-gaps`
  - chỉ cập nhật D1 nội bộ từ `product_variations`, không gửi giá/tồn lên sàn.
- Thêm route chi tiết SKU:
  - `GET /api/discounts/promotion-sku-detail`
  - trả cùng lúc promotion item, tồn/giá từ `product_variations`, ADS 30 ngày, đơn/doanh thu 30 ngày, giá vốn và kiểm lãi.
- Thêm hàng đợi duyệt apply promotion:
  - `POST /api/discounts/promotions/queue-apply`
  - `GET /api/discounts/promotions/apply-queue`
  - `POST /api/discounts/promotions/apply-queue/decide`
  - yêu cầu tài khoản `admin` khi tạo/duyệt queue.
  - mỗi queue lưu `payload`, `preview_response`, `risk_summary`, `rollback_payload`, `created_by`, `status`, `sent_to_platform=false`.
- Cập nhật UI `Khuyến mãi sàn`:
  - nút `Làm sạch giá 0đ`;
  - nút `Chi tiết SKU`;
  - nút `Đưa vào hàng đợi duyệt`;
  - box `Hàng đợi duyệt`;
  - banner Lazada Early Bird preview-only.
- Chốt Lazada Early Bird Price API là `preview_only_locked`: có dựng preview endpoint `/activity/early/bird/create` và `/activity/early/bird/addSkus`, nhưng không mở vận hành apply thật.

### Đã kiểm tra thực tế

- `node --check` pass cho:
  - `apps/worker-api/src/routes/discounts.js`
  - `apps/worker-api/src/core/promotion-tool-core.js`
  - `apps/fe/js/dashboard/ads.js`
- Worker API:
  - dry-run pass
  - deploy production version cuối `17238ac8-f0c2-4dfc-a2a0-0f998777a2f7`
- Frontend/static:
  - dry-run pass
  - deploy production version `d8fa365c-7872-429c-8f9c-4f0adb06a149`
- Production `POST /api/discounts/promotion-items/repair-prices` với Shopee Bundle:
  - `scanned=8`
  - `matched=5`
  - `updated=5`
  - `partial=2`
  - `missed=3`
- Production `GET /api/discounts/promotion-sku-detail` cho item `13360862373`:
  - SKU `DAUVOIXITINOXK125`
  - giá gốc `99.000`
  - giá KM `69.000`
  - tồn `77`
  - giá vốn `28.500`
  - đơn 30 ngày `1`
  - doanh thu 30 ngày `69.000`
  - đủ điều kiện queue khi giá mục tiêu `79.000`
- Production UI bằng Chrome profile admin:
  - ADS nạp đúng `ads.js?v=ads-apply-queue-20260507`
  - tab `Khuyến mãi sàn` active
  - Shopee Bundle có `54` dòng
  - mở chương trình có `5` item
  - item thiếu mapping được đưa vào queue trạng thái `needs_data`
  - item `13360862373` được preview giá theo tồn: target `79.000`, `apply_locked=true`, `sent_to_platform=false`
  - đưa vào hàng đợi thành công với `status=queued`, `cost=28.500`, `sent=false`
  - mobile width `390px` không tràn ngang, không có console error
- Production `GET /api/discounts/promotion-tool-core?limit=5` sau chốt Early Bird:
  - `total_modules=9`
  - `done=8`
  - `pending=0`
  - `locked=8`
  - Early Bird: `core_status=bị khóa an toàn`, `safe_status=preview_only_locked`

### Trạng thái phase

- `Đã xong`: làm sạch cache giá 0đ, chi tiết SKU theo promotion + ADS + tồn + doanh thu + giá vốn, hàng đợi duyệt apply, rollback payload, Early Bird preview-only, deploy và kiểm production.
- `Đang làm dở`: vẫn còn item promotion chưa map được sang `product_variations`; các dòng này đi queue trạng thái `needs_data`.
- `Chưa làm`: adapter gửi thật lên từng endpoint promotion sau khi queue được duyệt; màn hình approve/reject nhiều dòng.
- `Bị khóa an toàn`: mọi queue hiện vẫn `sent_to_platform=false`; chưa có nút gửi thật lên sàn trong UI.
- `Bị chặn bởi quyền/app`: không phát sinh lỗi quyền mới; Early Bird bị khóa do chính sách an toàn, không phải do thiếu quyền app.

### Shop có API

- Shopee có API: có thể đọc cache promotion, map SKU/tồn/giá, kiểm lãi, đưa payload preview vào hàng đợi admin.
- Lazada có API: Seller Voucher/Free Shipping/Flexicombo vẫn read-only; Early Bird chỉ preview endpoint ghi giá và khóa apply.

### Shop không có API

- Không gọi Open Platform và không tạo queue “đồng bộ API”.
- Fallback tiếp tục là dữ liệu tham chiếu từ đơn/report/import/browser có log; nếu thiếu mapping thì trạng thái là `needs_data`.

### Vấn đề để tiếp tục

- Viết adapter gửi thật theo từng module sau khi queue đã được duyệt, bắt đầu từ Shopee Discount vì đã có action guard cũ.
- Làm màn hình quản trị hàng đợi nâng cao: approve/reject/request data, lọc theo trạng thái và shop.
- Bổ sung mapping SKU cho các item còn `missed` khi repair.

## 2026-05-07 - marketplace_push_core queue sync incremental OMS

### Việc đã làm

- Thêm bảng core `marketplace_push_sync_queue` để lưu hàng đợi sync incremental từ webhook Shopee/Lazada.
- Mở rộng webhook handler để phân loại event vào các nhóm hành động:
  - `sync_order`
  - `sync_return_order`
  - `sync_order_label`
  - `sync_products`
  - `record_chat_signal`
  - `log_only`
- Thêm API vận hành:
  - `GET /api/webhooks/sync-queue`
  - `POST /api/webhooks/sync-queue`
- Cron 5 phút đã nối chạy lát cắt nhỏ `max_jobs=1` để retry queue mà không làm callback chậm hoặc vượt quota Worker.
- `GET /api/webhooks/events?core=1` đã trả thêm summary `sync_queue`.
- OMS Dashboard / Trung tâm API đã có khu `Hàng đợi push incremental`, metric `Đang chờ / Đã xử lý / Lỗi cần retry / Chỉ ghi log` và nút `Chạy hàng đợi push`.

### Đã kiểm tra thực tế

- `node --check` pass cho:
  - `apps/worker-api/src/core/marketplace-push-core.js`
  - `apps/worker-api/src/routes/marketplace-webhooks.js`
  - `apps/worker-api/src/routes/api-modules.js`
  - `apps/worker-api/src/index.js`
  - `apps/fe/js/modules/oms-api-advanced.js`
  - `apps/fe/js/oms-main.js`
- Worker dry-run pass, deploy production version `cfb6f63e-d293-4a1c-8b7e-d1a2ac8c33e7`.
- Frontend dry-run pass, deploy production version `5e5ab060-33f4-4dfb-a9d3-f82fb7acfa25`.
- Production callback verify:
  - `GET /api/webhooks/shopee?challenge=codex-push-queue-check` trả đúng challenge.
  - `GET /api/webhooks/lazada?challenge=codex-push-queue-check` trả đúng challenge.
- Production queue API:
  - `GET /api/webhooks/sync-queue?limit=5` tạo/đọc queue thành công.
  - Webhook Shopee chat test an toàn tạo queue `webchat_push`, shop `chihuy2309`, action `record_chat_signal`.
  - `POST /api/webhooks/sync-queue` chạy queue thành công: `selected_jobs=1`, `done=1`, `failed=0`.
  - Sau khi chạy, queue summary: `queued=0`, `done=1`, `failed=0`.
- Production API module:
  - `GET /api/advanced/modules?limit=5` có workspace `push_incremental`.
  - `POST /api/advanced/modules/actions` với `action=drain_push_queue` trả `status=ok`.
- Production UI bằng Chrome profile admin:
  - mở `oms-dashboard.html?verify=push-queue-20260507#api-advanced`
  - modal `Trung tâm API` mở được, không bị chuyển login
  - khu `Hàng đợi push incremental` hiển thị `Đang chờ 0`, `Đã xử lý 1`, `Lỗi cần retry 0`
  - bấm nút `Chạy hàng đợi push` trả toast `Đã chạy hàng đợi push incremental.`
  - mobile width `390px` không tràn ngang (`overflowX=0`)

### Trạng thái phase

- `Đã xong`: queue sync incremental OMS cho push/webhook, route đọc/chạy queue, cron lát cắt nhỏ, UI Trung tâm API, deploy Worker/frontend và kiểm production.
- `Đang làm dở`: subscription event đầy đủ vẫn chưa tự bật; return/product/label push sẽ được xử lý dần theo queue khi sàn đẩy event thật.
- `Chưa làm`: bật đồng nhất Shopee push giữa các partner app và subscribe đủ Lazada Message Service trong console.
- `Bị khóa an toàn`: chưa gọi Shopee `set_app_push_config`, chưa tự subscribe Lazada Message Service, không có lệnh ghi cấu hình push lên sàn.
- `Bị chặn bởi quyền/app`: Lazada push vẫn cần kiểm trong LazOP Message Service/console; Shopee còn event bật một phần theo partner app.

### Shop có API

- Shopee/Lazada có API: khi nhận push, OMS ghi event và queue sync incremental; queue chỉ gọi API đọc/sync lại đơn, hoàn/trả, label, sản phẩm hoặc chat.
- Queue có retry và trạng thái rõ `queued / processing / done / failed / skipped / log_only`.

### Shop không có API

- Không có push chính thức từ sàn và không gắn nhãn realtime API.
- Fallback tiếp tục là `browser_sync`, `import_file_sync`, `manual_reference` có log.

### Vấn đề để tiếp tục

- Đối chiếu/bật đủ Shopee Push event giữa các partner app nếu các shop dưới partner đó cần realtime.
- Vào LazOP Message Service subscribe đủ nhóm order/reverse/product/stock/video/auth/review/IM cho callback `/api/webhooks/lazada`.
- Sau khi có nhiều event thật trong queue, bổ sung bộ lọc UI theo `platform/shop/status/event_group`.

## 2026-05-07 - review_core đọc-only Shopee/Lazada và UI Trung tâm API

### Việc đã làm

- Thêm `apps/worker-api/src/core/review-core.js` để chuẩn hóa review Shopee/Lazada vào bảng `marketplace_product_reviews`, tính tổng review, review xấu, review cần trả lời, review có media và rủi ro trùng ADS.
- Thêm bảng log `marketplace_review_action_logs` cho preview phản hồi review; mọi preview hiện lưu `sent_to_platform=false`, `apply_locked=true`.
- Thêm route:
  - `GET /api/reviews`
  - `POST /api/reviews/sync`
  - `POST /api/reviews/shopee/sync`
  - `POST /api/reviews/lazada/sync`
  - `POST /api/reviews/reply-preview`
- Nối Shopee `Product.get_comment` ở chế độ đọc-only; Shopee `Product.reply_comment` chỉ dựng preview/log, chưa gửi thật.
- Nối Lazada `/review/seller/history/list` và `/review/seller/list/v2` ở chế độ đọc-only; Lazada `/review/seller/reply/add` chỉ dựng preview/log, chưa gửi thật.
- Thêm workspace/module `Đánh giá sản phẩm` trong OMS Dashboard / Trung tâm API, có metric tổng review, review xấu, cần trả lời, trùng ADS và nút `Cập nhật đánh giá API`.
- Sửa frontend `fetchJson` của Trung tâm API dùng `cache: no-store` để Chrome không giữ response cũ khi vừa deploy module mới.

### Đã kiểm tra thực tế

- `node --check` pass cho:
  - `apps/worker-api/src/core/review-core.js`
  - `apps/worker-api/src/routes/reviews.js`
  - `apps/worker-api/src/routes/api-modules.js`
  - `apps/worker-api/src/index.js`
  - `apps/fe/js/modules/oms-api-advanced.js`
  - `apps/fe/js/oms-main.js`
- Worker dry-run pass, deploy production version `2cfbc60c-b6f9-46ec-b3ab-e2bc6ec1395d`.
- Frontend dry-run pass, deploy production version `b95d3340-1e43-4d98-a2fb-cceeea1db35f`.
- Production API:
  - `POST /api/reviews/shopee/sync` lượt đầu đọc `20` review shop `chihuy2309`, lưu `20` dòng.
  - `POST /api/reviews/lazada/sync` mẫu `shop_limit=1`, `item_limit=2`, `days=7` chạy `status=ok`, chưa có review trong cửa sổ/item mẫu.
  - `POST /api/reviews/reply-preview` với review đã có phản hồi trả `400` đúng guard, có preview payload endpoint Shopee nhưng không gửi sàn; log test đã được xóa khỏi D1.
- Production UI bằng Chrome profile admin thật:
  - mở `oms-dashboard.html#api-advanced`, module `Đánh giá sản phẩm` hiển thị trong Trung tâm API.
  - bấm nút `Cập nhật đánh giá API` thành công, toast trả `Đã cập nhật đánh giá sản phẩm ở chế độ đọc-only; phản hồi thật lên sàn vẫn khóa preview/log.`
  - sau khi bấm, `GET /api/reviews?limit=1` trả `total_reviews=100`, `negative_reviews=3`, `need_reply_reviews=0`, `with_media_reviews=14`, `ads_risk_reviews=0`, `last_synced_at=2026-05-07 08:41:22`.
  - mobile width `390px` có `reviewButtonCount=2`, `overflowX=0`, không tràn ngang.

### Trạng thái phase

- `Đã xong`: `review_core`, route API đọc review, Shopee get_comment read-only, Lazada history/list read-only, preview phản hồi bị khóa, UI Trung tâm API, deploy Worker/frontend và kiểm production bằng API + Chrome thật.
- `Đang làm dở`: gắn review vào dashboard sản phẩm/ADS; batch Lazada cần mở rộng theo nhiều item/ngày; dòng review cần bổ sung tên sản phẩm/SKU từ catalog.
- `Chưa làm`: màn hình xử lý review riêng theo SKU/campaign; quy trình duyệt phản hồi thật nếu sau này muốn gửi lên sàn.
- `Bị khóa an toàn`: Shopee `Product.reply_comment` và Lazada `/review/seller/reply/add` chưa gửi thật, chỉ preview/log.
- `Bị chặn bởi quyền/app`: chưa phát sinh lỗi quyền mới; Lazada mẫu không có dữ liệu review trong cửa sổ 7 ngày/item đã kiểm.

### Shop có API

- Shopee có API: đọc được review thật bằng `Product.get_comment`, lưu core chung và hiển thị trong OMS; phản hồi thật vẫn khóa.
- Lazada có API: adapter đọc review history/list đã chạy được; cần đồng bộ catalog/item rộng hơn để tăng độ phủ.

### Shop không có API

- Không gọi Open Platform và không gắn nhãn đồng bộ API.
- Fallback là dữ liệu OMS đã lưu, import/report hoặc thao tác tay trên Seller Center có log; nội dung phản hồi nếu có chỉ lấy từ preview rồi người vận hành tự gửi.

### Vấn đề để tiếp tục

- Gắn `review_core` vào dashboard sản phẩm và ADS để cảnh báo SKU/campaign có review xấu.
- Mở batch Lazada theo nhiều item và nhiều lát 7 ngày để phủ lịch sử review tốt hơn.
- Bổ sung mapping tên sản phẩm/SKU cho review Shopee/Lazada từ `product_catalog_core` và `sku_identity_core`.
- Nếu muốn mở trả lời review thật: làm hàng đợi duyệt admin, preview nội dung, giới hạn ký tự, log request/response và rollback/dừng khi API lỗi.

## 2026-05-07 - review_core product-risk nối vào Sản phẩm và ADS

### Việc đã làm

- Thêm API `GET /api/reviews/product-risk` để gom sản phẩm có review xấu theo `platform/shop/item_id/SKU/tên sản phẩm`.
- `review_core` đã map review qua `marketplace_product_catalog_snapshots` bằng `platform_item_id` trước, sau đó dùng SKU/tên để đối chiếu `marketplace_ads_campaign_snapshots`.
- `GET /api/reviews` đã dùng lại product-risk summary nên chỉ số `ads_risk_reviews` không còn phụ thuộc riêng vào SKU/tên trống của review Shopee.
- Trang `admin-products` đã có panel `Review xấu theo sản phẩm`, nút `Làm mới review`, và badge sẵn để gắn lên card variation khi sản phẩm đang nằm trong trang hiện tại.
- Trang `ads` đã có panel `Review xấu trùng ADS` và thêm cột `Review` trong bảng `Sản phẩm/SKU cần tối ưu`.

### Đã kiểm tra thực tế

- `node --check` pass cho:
  - `apps/worker-api/src/core/review-core.js`
  - `apps/worker-api/src/routes/reviews.js`
  - `apps/fe/js/admin/var-core.js`
  - `apps/fe/js/dashboard/ads.js`
- Worker dry-run pass, deploy production version `6ccc1270-05bb-439b-ae9c-4edddc80adbf`.
- Frontend dry-run pass, deploy production version `ef74779d-9803-4c33-98b8-e0747957b0a4`; sau khi thêm comment tiếng Việt trong `var-core.js` đã deploy lại version `a2471bf9-e5f9-4ac5-93ac-cf2976ec8715`.
- Production API:
  - `GET /api/reviews/product-risk?limit=5&days=14` trả `returned_products=3`, `negative_reviews=3`, `need_reply_reviews=0`, `ads_risk_products=0`.
  - `GET /api/reviews?limit=2` vẫn trả `total_reviews=100`, `negative_reviews=3`, `with_media_reviews=14`, `ads_risk_reviews=0`.
- Production UI bằng Chrome thật qua CDP `127.0.0.1:9333`, viewport mobile `390px`:
  - `admin-products#variations` hiển thị panel `Review xấu theo sản phẩm`, có `3` dòng risk thật và `20` card variation đang render.
  - Sau redeploy frontend cuối, mở lại `admin-products#variations` vẫn có `riskRows=3`, `cards=20`.
  - `ads#ads-overview` hiển thị summary `0 sản phẩm trùng ADS · 3 sản phẩm có review xấu`.
  - Bảng ADS có cột `Review`, `productSummary=23 SKU/campaign`.
  - Không thấy tràn ngang ở panel review khi xem ảnh chụp mobile.

### Trạng thái phase

- `Đã xong`: API product-risk, map review qua catalog/ADS, UI trang sản phẩm, UI trang ADS, deploy Worker/frontend và kiểm production bằng API + Chrome thật.
- `Đang làm dở`: Lazada review cần batch nhiều item/nhiều lát 7 ngày; một số review Shopee còn thiếu catalog binding nên vẫn hiện `Sản phẩm chưa rõ`.
- `Chưa làm`: màn hình hàng đợi duyệt trả lời review thật; bộ lọc riêng theo shop/SKU/review status trong trang review chuyên dụng.
- `Bị khóa an toàn`: Shopee `Product.reply_comment` và Lazada `/review/seller/reply/add` vẫn chỉ preview/log, chưa gửi thật lên sàn.
- `Bị chặn bởi quyền/app`: chưa phát sinh lỗi quyền mới trong phase này.

### Shop có API

- Shop có API đọc review thật vào `marketplace_product_reviews`, map qua catalog rồi cảnh báo trên trang sản phẩm/ADS.
- ADS chỉ đọc snapshot đã lưu; không tự tắt/bật campaign khi gặp review xấu.

### Shop không có API

- Không gọi Open Platform và không gắn nhãn đồng bộ API.
- Fallback là chỉ hiển thị nếu đã có review trong OMS/import/cache; nếu chưa có API và chưa import thì panel sẽ báo chưa có review xấu trong core.

### Vấn đề để tiếp tục

- Làm batch Lazada review theo nhiều item và nhiều cửa sổ 7 ngày để phủ dữ liệu thật hơn.
- Bổ sung repair/mapping catalog cho review còn `Sản phẩm chưa rõ`, ưu tiên Shopee item_id `14108646386`.
- Thiết kế hàng đợi duyệt reply thật: preview nội dung, quyền admin, log request/response, giới hạn ký tự và trạng thái dừng nếu API lỗi.

## 2026-05-07 - review_core repair mapping catalog + batch Lazada an toàn

### Việc đã làm

- Mở rộng `apps/worker-api/src/core/review-core.js` để repair `item_sku` theo `marketplace_product_knowledge.variations` và `model_id` review; chỉ bù field trống/placeholder, không ghi đè dữ liệu review đã đúng.
- Thêm route vận hành:
  - `POST /api/reviews/repair-mapping`
  - `POST /api/reviews/lazada/batch-sync`
- Sửa `apps/worker-api/src/routes/reviews.js` để batch Lazada chạy theo `subrequest_budget`, tự tính `safe_item_limit` và dừng sớm có chủ đích thay vì đụng giới hạn Cloudflare Worker.
- Cập nhật `apps/worker-api/src/routes/api-modules.js` để OMS đổi nút thành `Batch Lazada 28 ngày an toàn` và phản hồi rõ khi cần bấm lại để quét tiếp.
- Đồng bộ full catalog Shopee cho `chihuy2309`, `chihuy1984` và catalog Lazada cho `kinhdoanhonlinegiasoc@gmail.com` để xử lý dứt điểm dữ liệu bẩn review thiếu mapping.

### Đã kiểm tra thực tế

- `node --check` pass cho:
  - `apps/worker-api/src/core/review-core.js`
  - `apps/worker-api/src/routes/reviews.js`
  - `apps/worker-api/src/routes/api-modules.js`
- Worker production deploy cuối cùng version `ccff0a0b-5d71-4051-bfc1-98fb0691e291`.
- D1 remote kiểm tra trước repair cho thấy các item review đang thiếu map như `14108646386`, `27758197077`, `5923341978`, `7948356795` chưa có trong `marketplace_product_catalog_snapshots`.
- Production sync catalog Shopee:
  - `chihuy2309`: `196` sản phẩm qua 5 lượt (`40 + 40 + 40 + 40 + 36`), không warning.
  - `chihuy1984`: `211` sản phẩm qua 6 lượt (`40 + 40 + 40 + 40 + 40 + 11`), không warning.
- Production sync catalog Lazada:
  - `kinhdoanhonlinegiasoc@gmail.com`: `80` sản phẩm, `158` variations, không warning.
- Production `POST /api/reviews/repair-mapping`:
  - lượt đầu sau sync catalog nhưng trước vá `model_id -> SKU`: `scanned=85`, `matched=85`, `updated=48`, `remaining=79`
  - lượt cuối sau deploy core mới: `scanned=79`, `matched=79`, `updated=79`, `remaining=0`, `knowledge_rows=409`
- D1 production xác nhận review Shopee đã bù SKU đúng:
  - `14108646386 -> GANGTAYCACHNHIET_K09`
  - `27758197077 -> K232-XAM`
  - `5923341978 -> 1_dui_den_428a_k64`
  - `7948356795 -> BO16TRONGDUCH110`
- Production `POST /api/reviews/lazada/batch-sync`:
  - lượt cũ với `item_limit=20` đã lộ lỗi thật `Too many subrequests by single Worker invocation`
  - sau khi thêm `subrequest_budget=32`, route chạy `items_checked=7`, `windows_checked=28`, `subrequests_used=28`, `warnings=0`, `budget_truncated=false`, chưa thấy review trong 28 ngày ở 7 item đang quét
- Production `GET /api/reviews?limit=5` trả:
  - `total_reviews=100`
  - `negative_reviews=3`
  - `catalog_gap_reviews=0`
- Production `GET /api/advanced/modules?limit=5` trả module `review_core` với nút `Batch Lazada 28 ngày an toàn`.
- Production Chrome thật qua CDP `127.0.0.1:9333`:
  - mở `oms-dashboard?verify=review-batch-20260507e#api-advanced`
  - modal `Trung tâm API nâng cao` mở được
  - card review hiển thị:
    - `Tổng review 100`
    - `Review xấu 3`
    - `Cần trả lời 0`
    - `Trùng ADS 0`
    - `Thiếu map catalog 0`
  - hiện đủ nút:
    - `Cập nhật đánh giá API`
    - `Batch Lazada 28 ngày an toàn`
    - `Sửa mapping review`

### Trạng thái phase

- `Đã xong`: repair mapping review theo catalog + listing knowledge, dọn sạch gap catalog production về `0`, batch Lazada an toàn theo budget, cập nhật module OMS và kiểm production bằng API + Chrome thật.
- `Đang làm dở`: batch Lazada 28 ngày mới quét `7` item/lượt theo budget an toàn; muốn phủ sâu hơn cần chia tiếp nhiều lượt/cursor hoặc job nền.
- `Chưa làm`: hàng đợi duyệt reply thật theo review với preview/admin/log/request-response.
- `Bị khóa an toàn`: Shopee `Product.reply_comment` và Lazada `/review/seller/reply/add` vẫn chỉ preview/log.
- `Bị chặn bởi quyền/app`: không phát sinh lỗi quyền mới; Lazada batch read-only đang chạy được nhưng shop mẫu chưa trả review trong 28 ngày/item đã quét.

### Shop có API

- Shopee có API: sync review thật, bù `item_sku / product_name / shop_id` từ catalog + listing knowledge, cảnh báo sang OMS/Sản phẩm/ADS.
- Lazada có API: sync catalog thật, batch review read-only theo các cửa sổ 7 ngày và ngân sách subrequest an toàn; nếu cần phủ sâu thì chạy thêm lượt.

### Shop không có API

- Không gọi Open Platform và không gắn nhãn đồng bộ API.
- Fallback là OMS/import/report/cache thủ công; review chỉ hiện khi đã có dữ liệu lõi, không giả lập đồng bộ sàn.

### Vấn đề để tiếp tục

- Làm hàng đợi duyệt reply thật theo review: preview, quyền admin, log request/response, giới hạn ký tự, trạng thái dừng.
- Nếu cần Lazada phủ sâu hơn 7 item/lượt, tách batch nhiều lượt/cursor hoặc job nền cron để quét dần mà không đụng subrequest limit.
- Sau khi có review Lazada thật, bổ sung màn hình riêng lọc theo `platform / shop / SKU / review_status`.

## 2026-05-07 - chat live không còn bị khóa bởi `/api/chat/shops`

### Việc đã làm

- Sửa `apps/fe/js/dashboard/chat.js` để `loadChatDashboard()` không còn chờ cứng `loadChatShops()` trước khi tải hội thoại.
- Tách `loadChatShopsInBackground()` để capability shop chạy nền, giữ danh sách chat vào được ngay cả khi endpoint setup chậm hoặc gặp cold start.
- Nới timeout lần mở đầu của `loadChatConversations()` lên `25s`; polling nền vẫn giữ timeout ngắn để không giữ request treo.
- Thêm trạng thái UI rõ ràng trong `chatSetupStatus`: nếu setup shop đang chậm sẽ hiện `Đang tải shop chat...` thay vì để người dùng nhìn như treo.
- Bump version `chat.js` tại:
  - `apps/fe/pages/chat-marketplace.html`
  - `apps/fe/pages/profit-dashboard.html`

### Đã kiểm tra thực tế

- `node --check apps/fe/js/dashboard/chat.js` pass.
- Frontend dry-run pass với `npx wrangler deploy --dry-run`.
- Frontend production deploy version `7443e694-8466-408d-9daa-7e52c513f22b`.
- Production API đo thời gian thực:
  - `GET /api/chat/shops` có lúc chạm khoảng `20648ms` ở lượt đầu rồi về khoảng `408-457ms` ở lượt sau, xác nhận đúng kiểu cold start/chậm đầu phiên.
  - `GET /api/chat/conversations?limit=20` trả nhanh khoảng `201ms`.
- Production UI bằng Chrome thật qua CDP `127.0.0.1:9333`, viewport mobile `390px`:
  - Mở `chat-marketplace.html` bình thường: `60` hội thoại, `2` chưa đọc, `7` lựa chọn shop.
  - Giả lập chậm riêng `/api/chat/shops` thêm `18s`: sau `5s` danh sách vẫn hiện `60` hội thoại, `chatSetupStatus` báo `Đang tải shop chat...`, filter shop tạm còn `1` option.
  - Sau `21s` cùng phiên giả lập: setup shop tự nạp xong, filter shop về `7` option, không cần tải lại trang.
  - Mở `profit-dashboard.html`, chuyển sang tab chat: vẫn hiện `60` hội thoại, `7` lựa chọn shop, không vỡ bản nhúng.

### Trạng thái phase

- `Đã xong`: chặn lỗi trang chat treo do phụ thuộc cứng vào `/api/chat/shops`; chat page và bản nhúng trong profit dashboard đều tải được khi setup shop chạy nền.
- `Đang làm dở`: chưa xử lý triệt để phần dữ liệu rác/preview hệ thống trong một số hội thoại Shopee/TikTok, và chưa tối ưu sâu endpoint backend `chat/shops`.
- `Chưa làm`: auto-reply AI thật theo rule/guard/log; màn hình tự động hóa chat riêng; rà triệt để pipeline loading của context/messages khi mở sâu hội thoại.
- `Bị khóa an toàn`: AI vẫn mới dừng ở gợi ý/draft; chưa bật gửi tự động hàng loạt.
- `Bị chặn bởi quyền/app`: Shopee chat vẫn còn các thao tác nhạy cảm thiếu docs public đầy đủ; Lazada IM cần app/quyền đủ nếu muốn mở thêm thao tác beyond text/read.

### Shop có API

- Shop có API vẫn ưu tiên lấy danh sách hội thoại/tin nhắn qua API theo `chat_transport_core`; giờ dù capability shop load chậm thì màn hình chat vẫn vào được và vẫn đọc danh sách hội thoại trước.
- Lazada API shop có quyền IM vẫn theo đường API; Shopee API shop vẫn chạy có guard/log như trước.

### Shop không có API

- Shop không API vẫn fallback theo `browser_scan_policy_core` và dữ liệu đã lưu trong OMS.
- Nếu setup shop chậm hoặc lỗi, UI chỉ hoãn phần capability/filter shop; không chặn người dùng xem danh sách hội thoại đã lưu.

### Vấn đề để tiếp tục

- Rà gốc backend `GET /api/chat/shops` để giảm cold start/lượt đầu, tránh phụ thuộc vào cảm giác “vào lần đầu hơi ì”.
- Kiểm tra tiếp luồng mở sâu `messages/context` xem còn điểm nào gây loading lâu khi bấm vào từng hội thoại thật.
- Sau khi chat loading ổn định hơn, chuyển phase 2 sang `AI auto-reply thật`: rule bật/tắt theo shop, guard, log, duyệt ngoại lệ và cơ chế dừng an toàn.

## 2026-05-07 - chat F5 hết treo ở production và chốt lại trạng thái Lazada IM

### Việc đã làm

- Sửa `apps/worker-api/src/routes/chat.js` để `ensureChatTables()` dùng marker schema lưu trong D1 (`marketplace_chat_meta`) thay vì lần nào cold start cũng chạy lại toàn bộ nhánh DDL/backfill nặng.
- Giữ `ensureChatTablesFresh()` cho lần nâng schema thật, nhưng route đọc nóng (`settings / conversations / shops`) chỉ cần check version nhẹ sau khi schema đã ổn định.
- Sửa `GET /api/chat/conversations` không còn tự tính `summary` 5000 dòng mặc định vì frontend hiện không dùng trường này ở lần tải đầu.
- Đo lại production và kiểm F5 thật sau deploy để xác nhận chat không còn đứng ở `Đang tải chat...`.
- Chạy lại `POST /api/chat/api-sync` riêng cho Lazada shop `kinhdoanhonlinegiasoc@gmail.com` để xác minh trạng thái IM API hiện tại.

### Đã kiểm tra thực tế

- `node --check` pass cho:
  - `apps/worker-api/src/routes/chat.js`
- Worker dry-run pass với `npx wrangler deploy --dry-run`.
- Worker production deploy version `c4b66dcf-91f5-4b79-8fac-ccf591850a78`.
- Production API trước khi vá backend:
  - `GET /api/chat/conversations?limit=60&warm=0` lượt đầu có lúc ~`20453ms`.
  - `GET /api/chat/settings` và `GET /api/chat/shops` cũng có thể kéo rất lâu ở lần isolate đầu.
- Production API sau khi vá và ổn định marker schema:
  - `GET /api/chat/conversations?limit=60&warm=0`: `926ms`, rồi `347ms`.
  - `GET /api/chat/settings`: `413ms`, rồi `119ms`.
  - `GET /api/chat/shops`: `537ms`, rồi `237ms`.
- Production UI bằng Chrome thật qua CDP `127.0.0.1:9333`, viewport mobile `390px`:
  - Mở mới `chat-marketplace.html`: hội thoại hiện sau khoảng `520ms`, shop filter đủ `7` option.
  - `Page.reload(ignoreCache=true)` tương đương F5 cứng: hội thoại hiện lại sau khoảng `516ms`.
  - Sau reload vẫn thấy `60` hội thoại, `0` chưa đọc, `chatSetupStatus` về `0 đơn · 0 sản phẩm · 20 từ khóa`.
- Lazada IM API production hiện tại:
  - `POST /api/chat/api-sync` với `platform=lazada`, `shop=kinhdoanhonlinegiasoc@gmail.com`, `diagnostic=true`
  - trả `status=permission_required`
  - `last_error.code=InsufficientPermission`
  - `message=App does not have permission to access this api`
  - nghĩa là shop đã có token API nhưng app Lazada hiện chưa được cấp quyền `In-house IM Chat` cho `/im/session/list` và `/im/message/list`.

### Trạng thái phase

- `Đã xong`: hết treo khi F5 ở production; route chat nóng không còn bị schema cold start làm kéo dài hàng chục giây; production web đã kiểm bằng Chrome thật.
- `Đang làm dở`: chưa xử lý fallback tự động cho trường hợp Lazada có token nhưng thiếu quyền IM; chưa dọn sâu dữ liệu preview hệ thống/rác ở một số hội thoại.
- `Chưa làm`: phase 2 AI auto-reply thật; khu cài đặt chat riêng cho `AI & Luật / Mẫu AI / Từ khóa / Lưu ý SP`.
- `Bị khóa an toàn`: auto-reply vẫn chưa bật gửi thật hàng loạt; mọi reply vẫn phải đi qua guard từ khóa.
- `Bị chặn bởi quyền/app`: Lazada IM chính thức đang bị `InsufficientPermission`, nên chưa thể coi là đã kéo nội dung chuẩn qua API chat.

### Shop có API

- Shop Shopee có API: vẫn ưu tiên API chat như trước.
- Shop Lazada có token API nhưng nếu app chưa có quyền IM thì hiện chưa kéo được nội dung chat chính thức; OMS chỉ có thể dựa vào dữ liệu đã lưu sẵn hoặc fallback browser nếu mở luồng đó.

### Shop không có API

- Vẫn fallback theo `browser_scan_policy_core` hoặc dữ liệu OMS đã lưu.
- Không gắn nhãn đồng bộ API cho shop chưa đủ quyền hoặc chưa có endpoint chat thật.

### Vấn đề để tiếp tục

- Quyết định rõ cho Lazada: khi `permission_required` thì có tự chuyển sang browser fallback hay chỉ báo lỗi quyền rồi dừng.
- Làm phase 2 `AI auto-reply thật` sau khi chốt luồng fallback/permission cho Lazada.
- Tách 4 mục `Lưu ý SP / AI & Luật / Mẫu AI / Từ khóa` ra khu cài đặt riêng mà không đổi core guard.

## 2026-05-07 - chat tách khu Cài đặt chat riêng, panel phải chỉ giữ ngữ cảnh

### Đã làm

- Sửa `apps/fe/js/dashboard/chat.js` để tách rõ 2 nhóm tab:
  - panel phải chỉ còn `Đơn hàng / Sản phẩm / Voucher`
  - modal `Cài đặt chat` riêng có tab `Tự động hóa / AI & Luật / Mẫu AI / Từ khóa / Lưu ý SP`
- Giữ nguyên core guard và luồng gửi:
  - bộ chặn từ khóa vẫn đọc từ `marketplace_chat_settings`
  - AI draft vẫn đi qua `ai-draft -> guard -> send`
  - không đổi core `chat_transport_core`, `chat_identity_core`, `browser_scan_policy_core`
- Đổi nút mở từ `Cài đặt tự động` thành `Cài đặt chat` ở cả:
  - `apps/fe/pages/chat-marketplace.html`
  - `apps/fe/pages/profit-dashboard.html`
- Tách riêng tab cài đặt nhưng vẫn dùng lại cùng state/settings hiện có, để không tạo thêm nguồn dữ liệu thứ hai.
- Bump cache frontend:
  - `dashboard.css?v=chat-settings-tabs-20260507`
  - `chat.js?v=chat-settings-tabs-20260507`

### Kiểm tra cú pháp

- `node --check apps/fe/js/dashboard/chat.js` pass.

### Deploy

- Frontend production: `87f7b8f4-8442-4b4e-a45e-bd0285c5f572`

### Kiểm production thật

- Mở production bằng Chrome thật qua CDP `127.0.0.1:9333`, mobile viewport `390px`.
- `chat-marketplace.html`:
  - vẫn lên `60` hội thoại
  - panel phải chỉ còn `Đơn hàng / Sản phẩm / Voucher`
  - nút đầu trang đổi thành `Cài đặt chat`
  - mở modal `Cài đặt chat sàn` thấy đủ tab:
    - `Tự động hóa`
    - `AI & Luật`
    - `Mẫu AI`
    - `Từ khóa`
    - `Lưu ý SP`
  - tab `Tự động hóa` hiển thị:
    - `3` shop API thật
    - `3` shop Chrome fallback
    - `7` alias Shopee đã loại khỏi Chrome
    - chu kỳ `5 phút`
  - gọi trực tiếp `setChatSettingsTab('rules')` trên production cho kết quả:
    - active tab đổi sang `AI & Luật`
    - hiện toggle `#chatAiEnabled`
- `profit-dashboard.html#chat`:
  - vẫn lên `60` hội thoại
  - panel phải chỉ còn `Đơn hàng / Sản phẩm / Voucher`
  - mở `Cài đặt chat` rồi gọi `setChatSettingsTab('rules')`:
    - active tab đổi sang `AI & Luật`
    - hiện toggle `#chatAiEnabled`

### Trạng thái phase

- `Đã xong`: tách khu `Cài đặt chat` riêng theo tab con; panel phải gọn lại chỉ giữ ngữ cảnh hội thoại; không làm vỡ loading chat production.
- `Đang làm dở`: phase 2 `AI auto-reply thật`; fallback tự động cho Lazada khi có token nhưng thiếu quyền IM; dọn sâu preview/rác trong một số hội thoại.
- `Chưa làm`: màn hình auto-reply/log riêng theo shop và rule bật/tắt tự động.
- `Bị khóa an toàn`: AI vẫn chưa được bật gửi thật hàng loạt khi chưa có cơ chế dừng/rollback rõ ràng.
- `Bị chặn bởi quyền/app`: Lazada IM vẫn `InsufficientPermission` nên chưa thể coi là API chat chuẩn đang chạy đầy đủ.

### Shop có API

- Shopee có API: vẫn ưu tiên API chat, không mở Chrome nếu capability shop xác nhận đi `api_chat_worker`.
- Lazada có token API: trạng thái shop đã hiện rõ trong `Cài đặt chat`; nếu app chưa có quyền IM thì chưa coi là nội dung chat chính thức, vẫn phải chốt hướng fallback riêng.

### Shop không có API

- Vẫn fallback theo `browser_scan_policy_core` và helper local.
- `Cài đặt chat` đã tách riêng để đội vận hành kiểm tra nhanh shop nào đang fallback Chrome và cấu hình Chrome đang dùng là gì.

### Vấn đề để tiếp tục

- Chốt hướng cho Lazada: `permission_required` thì tự fallback browser hay chỉ báo lỗi quyền rồi dừng.
- Làm phase 2 `AI auto-reply thật`:
  - bật/tắt theo shop
  - điều kiện tự gửi
  - guard trước khi gửi
  - log request/response
  - nút dừng an toàn
- Kiểm tra sâu thêm chuyện bấm trực tiếp trên tab cài đặt trong production theo thao tác tay người dùng, dù route/state production hiện đã render đúng toàn bộ nội dung tab.

## 2026-05-07 - chat ép câu trả lời khi khách xin thông tin liên hệ shop

### Việc đã làm

- Sửa `apps/worker-api/src/routes/chat.js` để nhận diện các câu hỏi xin `địa chỉ / Zalo / số điện thoại / thông tin liên hệ shop` và ép trả đúng một câu:
  - `Shop không thể cung cấp thông tin trên này vì sẽ vi phạm chính sách của sàn mong quý khách thông cảm giúp shop ạ .`
- Luật này được gom về một nguồn chuẩn dùng chung cho:
  - `ai-draft`
  - fallback nội bộ `makeLocalChatDraft`
  - dữ liệu `ai_rules` trả ra từ `GET /api/chat/settings`
- Sửa `apps/fe/js/dashboard/chat.js` để tab `AI & Luật` luôn hiện:
  - dòng rule ép câu trả lời liên hệ
  - ghi chú tiếng Việt ngay dưới ô cấu hình để đội vận hành biết đây là luật cứng

### Kiểm tra cú pháp

- `node --check apps/worker-api/src/routes/chat.js` pass.
- `node --check apps/fe/js/dashboard/chat.js` pass.

### Deploy

- Worker dry-run pass với `npx wrangler deploy --dry-run`.
- Frontend dry-run pass với `npx wrangler deploy --dry-run`.
- Worker production: `c8aa194f-d18a-47fc-9984-19453347cb1a`
- Frontend production: `3cd7ae85-b5ea-425b-a822-020eb2b04ed0`

### Kiểm production thật

- Production API:
  - `GET /api/chat/settings` trả `ai_enabled=1` và `ai_rules` có đủ dòng ép câu trả lời liên hệ shop.
  - `POST /api/chat/ai-draft` với payload mẫu `Shop cho mình xin địa chỉ, zalo và số điện thoại nhé.` trả:
    - `provider=policy-contact-block`
    - `reply=Shop không thể cung cấp thông tin trên này vì sẽ vi phạm chính sách của sàn mong quý khách thông cảm giúp shop ạ .`
    - `guard.allowed=true`
- Chrome production thật qua CDP `127.0.0.1:9333`, mobile `390px`:
  - reload `chat-marketplace.html?verify=contact-policy-...` thành công, không rơi về login, vẫn có `60` hội thoại
  - mở `Cài đặt chat > AI & Luật` thấy ghi chú:
    - `Nếu khách xin địa chỉ, Zalo hoặc số điện thoại của shop thì hệ thống sẽ tự ép đúng một câu từ chối theo chính sách sàn.`
  - ô `Nguyên tắc chi tiết cho AI` hiển thị đúng rule ép câu trả lời liên hệ
  - gọi trực tiếp route `ai-draft` từ chính trang chat production với câu hỏi xin liên hệ, ô trả lời được điền đúng câu từ chối
- Ảnh kiểm thực tế:
  - `C:\Users\Admin\AppData\Local\Temp\codex-chat-contact-policy\chat-settings-contact-rule.png`
  - `C:\Users\Admin\AppData\Local\Temp\codex-chat-contact-policy\chat-contact-policy-reply.png`

### Trạng thái phase

- `Đã xong`: ép câu trả lời cố định khi khách xin thông tin liên hệ của shop; rule và ghi chú đã hiện rõ trong UI cài đặt chat; kiểm production bằng API + Chrome thật.
- `Đang làm dở`: phase 2 `AI auto-reply thật`; fallback tự động cho Lazada khi có token nhưng thiếu quyền IM; dọn sâu preview/rác trong một số hội thoại.
- `Chưa làm`: màn hình auto-reply/log riêng theo shop và rule bật/tắt tự động.
- `Bị khóa an toàn`: AI vẫn chưa được bật gửi tự động hàng loạt khi chưa có cơ chế dừng/rollback rõ ràng.
- `Bị chặn bởi quyền/app`: Lazada IM vẫn `InsufficientPermission` nên chưa thể coi là API chat chuẩn đang chạy đầy đủ.

### Shop có API

- Shop có API vẫn ưu tiên route chat API như trước.
- Luật ép câu trả lời liên hệ shop chạy ở backend OMS trước khi vào Gemini, nên không phụ thuộc từng sàn API hay browser.

### Shop không có API

- Shop không API vẫn fallback Chrome/local helper như trước.
- Dù đi fallback, AI draft trong OMS vẫn bị ép đúng câu từ chối liên hệ shop trước khi nhân viên gửi.

### Vấn đề để tiếp tục

- Chốt hướng Lazada chat app riêng/token riêng rồi mới mở full IM sync.
- Làm phase 2 `AI auto-reply thật` nhưng phải giữ nguyên lớp ép câu trả lời liên hệ shop này ở backend core.
- Rà thêm các câu hỏi nhạy cảm khác nên ép câu trả lời cố định tương tự, ví dụ `chuyển khoản ngoài sàn`, `đặt đơn ngoài sàn`.

## 2026-05-07 - tách Lazada Chat thành app riêng, callback riêng và token riêng

### Việc đã làm

- Viết lại `apps/worker-api/src/handlers/auth.js` để tách rõ 2 app Lazada:
  - app chính dùng callback `/channels/lazada/callback`
  - app chat dùng callback `/channels/lazada/chat/callback`
  - route tạo link riêng `/api/auth/lazada/chat/url`
- Thêm bộ cột riêng cho chat app trong `shops`:
  - `chat_access_token`
  - `chat_refresh_token`
  - `chat_token_expire_at`
  - `chat_api_connected_at`
  - `chat_api_refresh_expire_at`
  - `chat_last_api_refresh_at`
  - `chat_api_redirect_url`
- Vá `apps/worker-api/src/core/chat-transport-core.js` để Lazada chỉ coi `chat_access_token` là token chat hợp lệ; không còn lấy `access_token` của app order/product để bật nhầm transport API.
- Vá `apps/worker-api/src/routes/chat.js` để:
  - tự nâng schema `shops` khi cold start
  - các query chat Lazada đọc thêm cột token chat riêng
  - `loadLazadaChatShopForConversation()` chỉ lấy shop có `chat_access_token`
  - `callLazadaChatPath()` chỉ ký bằng `LAZADA_CHAT_APP_KEY/LAZADA_CHAT_SECRET`
  - `syncChatApi` trả đúng `skipped/browser` cho Lazada khi shop mới có app chính mà chưa có token chat

### Kiểm tra cú pháp

- `node --check apps/worker-api/src/handlers/auth.js` pass.
- `node --check apps/worker-api/src/core/chat-transport-core.js` pass.
- `node --check apps/worker-api/src/routes/chat.js` pass.

### Deploy

- Worker production lần 1: `cc52e00a-b220-4f1a-96d3-79b37124845c`
- Worker production lần 2 (bump schema version để tạo cột thật trên D1): `e6535cc5-834e-4b67-b69b-8ad0ee4bd2d6`
- Worker production lần 3 (đổi `api-sync` để Lazada thiếu chat token trả `skipped` rõ ràng): `3fe08ce8-f5f5-46ba-b75d-916a3698e7cd`

### Kiểm production thật

- `GET /api/auth/lazada/url` production trả `302` đúng về:
  - `https://auth.lazada.com/oauth/authorize?...redirect_uri=https://huyvan-worker-api.nghiemchihuy.workers.dev/channels/lazada/callback&client_id=135731`
- `GET /api/auth/lazada/chat/url` production trả `409 missing_lazada_app_config` và báo rõ:
  - thiếu `app_key`, `secret`
  - callback chuẩn cần dùng là `https://huyvan-worker-api.nghiemchihuy.workers.dev/channels/lazada/chat/callback`
- `GET /channels/lazada/chat/callback` production trả cùng lỗi cấu hình rõ ràng, xác nhận callback chat riêng đã đi đúng route mới.
- `GET /api/chat/shops` production đã lên lại bình thường sau migrate schema:
  - shop Lazada `kinhdoanhonlinegiasoc@gmail.com`
  - `has_access_token=1`
  - `has_chat_access_token=0`
  - `transport=browser`
  - `chat_api_status=token_missing`
- `POST /api/chat/api-sync` với `platform=lazada` production hiện trả:
  - `status=ok`
  - `results[0].status=skipped`
  - `results[0].transport=browser`
  - `reason=Shop chưa có token API chat còn sống nên cần Chrome fallback nếu muốn đồng bộ chat.`

### Trạng thái phase

- `Đã xong`: core backend cho mô hình Lazada `2 app riêng, OMS gom chung`.
- `Đã xong`: callback chat riêng, token chat riêng, transport Lazada không còn đọc nhầm token app chính.
- `Đã xong`: worker production đã có `LAZADA_CHAT_APP_KEY` và `LAZADA_CHAT_SECRET`; route auth chat đã redirect thật.
- `Đang làm dở`: authorize app chat Lazada thật và đồng bộ IM thật để nhận `chat_access_token`.
- `Bị chặn bởi quyền/app`: chưa authorize seller cho app chat nên shop Lazada vẫn chưa có token chat riêng.

### Shop có API

- Shopee có API: không thay đổi, vẫn ưu tiên `api_chat_worker`.
- Lazada có app chính nhưng chưa có token chat riêng: production giờ hiện đúng là `browser`/`token_missing`, không giả làm API chat ready.
- Lazada có đủ app chat + token chat sau này: core đã sẵn callback/token/transport để nối tiếp authorize và kéo IM API thật.

### Shop không có API

- Vẫn fallback theo `browser_scan_policy_core` và helper local như cũ.
- Không bị ảnh hưởng bởi thay đổi này.

### Bổ sung ngày 2026-05-07 15:23 - đã nạp secret app chat Lazada vào worker

- Đã nạp production secret:
  - `LAZADA_CHAT_APP_KEY`
  - `LAZADA_CHAT_SECRET`
- Kiểm production thật:
  - `GET /api/auth/lazada/chat/url` trả `302` về `auth.lazada.com`
  - `client_id=138495`
  - `redirect_uri=https://huyvan-worker-api.nghiemchihuy.workers.dev/channels/lazada/chat/callback`
  - `GET /channels/lazada/chat/callback` khi chưa có `code` trả `400 Thiếu mã code từ Lazada IM Chat`
- `GET /api/chat/shops` sau khi nạp secret vẫn cho thấy Lazada:
  - `has_access_token=1`
  - `has_chat_access_token=0`
  - `transport=browser`
  - nghĩa là hệ thống đã sẵn authorize, nhưng shop chưa cấp token chat riêng.

### Vấn đề để tiếp tục

- Authorize app chat Lazada thật cho shop `kinhdoanhonlinegiasoc@gmail.com`.
- Sau khi có token chat, kiểm lại:
  - `GET /api/chat/shops` phải chuyển Lazada sang `transport=api`
  - `POST /api/chat/api-sync` phải kéo được `/im/session/list` và `/im/message/list`
  - `mark read` và `send text` phải đi qua IM API thật

### Bổ sung ngày 2026-05-07 - authorize xong app chat Lazada và đồng bộ IM thật

#### Việc đã làm

- Authorize xong app chat Lazada riêng cho shop `kinhdoanhonlinegiasoc@gmail.com`.
- Vá `apps/worker-api/src/routes/chat.js` để cả:
  - `/im/session/list`
  - `/im/message/list`
  đều truyền `start_time` bắt buộc qua helper `lazadaSessionListStartTime(...)`.
- Giữ comment tiếng Việt có dấu ngay tại đoạn core vì đây là điều kiện bắt buộc của Lazada IM API.

#### Kiểm tra cú pháp

- `node --check apps/worker-api/src/routes/chat.js` pass sau mỗi lần vá.

#### Deploy

- Worker production lần 4: `fdb17cdb-f4fb-4004-9ed3-7ad673da4ada`
  - vá `start_time` cho `/im/session/list`
- Worker production lần 5: `8d281b25-bbb7-4552-a084-4a6bb24a0a5f`
  - vá `start_time` cho `/im/message/list`

#### Kiểm production thật

- `GET /api/chat/shops` production hiện Lazada:
  - `has_chat_access_token=1`
  - `chat_api_connected_at=2026-05-07 08:43:55`
  - `transport=api`
  - `chat_api_status=ready`
- `POST /api/chat/api-sync` với `platform=lazada`, `limit=10`, `diagnostic=true` production trả:
  - `status=ok`
  - `pulled_conversations=10`
  - `pulled_messages=49`
  - `working_message_path=/im/message/list`
  - các attempt `/im/session/list` và `/im/message/list` đều `code=0`
- Kiểm tra web production thật qua Chrome CDP mobile `390px`:
  - mở `chat-marketplace`
  - lọc `platform=lazada`
  - danh sách hiện `17 hội thoại · 0 chưa đọc`
  - DOM thật render đủ `17` dòng Lazada
  - mở thread `Rick` và đọc được nội dung `Khách gửi [weary]`

#### Trạng thái phase

- `Đã xong`: authorize app chat Lazada riêng, nhận `chat_access_token`, kéo session và message thật bằng IM API.
- `Đang làm dở`: gửi text Lazada thật từ OMS, đánh dấu đã đọc thật từ OMS, dọn alias/canonical để giảm phụ thuộc conversation cũ `automation-*`.
- `Bị khóa an toàn`: chưa bật gửi tự động hàng loạt cho Lazada chat.
- `Bị chặn bởi quyền/app`: không còn chặn ở quyền IM cho bước đồng bộ cơ bản; nếu muốn mở thêm ngữ cảnh order/product sâu theo app chat thì vẫn nên hoàn tất `Order Information` và `Product Information`.

#### Shop có API

- Lazada có API chat: dùng app IM riêng + token chat riêng; OMS ưu tiên `api_chat_worker`, không mở Chrome tự động.
- Shopee có API: giữ nguyên luồng `api_chat_worker` như trước.

#### Shop không có API

- Không đổi: vẫn fallback Chrome/local helper theo `browser_scan_policy_core`.
- TikTok và các shop Shopee chưa có token chat vẫn không bị gắn nhãn realtime API.

#### Vấn đề để tiếp tục

- Kiểm thật `send text` Lazada qua IM API từ giao diện OMS.
- Kiểm thật `mark read` Lazada khi mở thread trong OMS.
- Hoàn thiện `chat_identity_core` và `chat_conversation_aliases` để hội thoại Lazada mới ưu tiên session chính thức thay vì còn bám một phần conversation cũ `automation-*`.

## 2026-05-07 - bỏ hẳn automation local cho Lazada chat và dọn lõi session chính thức

### Việc đã làm

- Xóa hẳn nhánh automation Lazada trong `scripts/chat_automation_browser.py`; file này chỉ còn chạy Chrome cho Shopee và TikTok.
- Giữ chặn cứng ở `scripts/oms-radar-local-helper.py` để mọi call local tới Lazada chat đều trả `lazada_automation_removed`, tránh ai vô tình mở lại luồng cũ.
- Sửa `apps/worker-api/src/core/chat-transport-core.js` để Lazada chỉ còn 2 trạng thái hợp lệ:
  - `api` khi app IM có token/quyền
  - `off` khi thiếu token/quyền hoặc còn cờ `browser` legacy trong DB
- Sửa `apps/fe/js/dashboard/chat.js` để UI không còn coi Lazada là phạm vi automation:
  - phạm vi chạy đổi thành `Shopee hoặc TikTok chưa có API chat chính thức`
  - nút đổi thành `Mở Chrome Shopee/TikTok` và `Chạy automation Shopee/TikTok`
- Vỡ một lớp dữ liệu cũ ở `apps/worker-api/src/routes/chat.js`: khi nhiều dòng Lazada cùng trỏ về một `canonical_conversation_id` chính thức, danh sách sẽ ưu tiên session IM thật thay vì để alias automation cũ chen lên.

### Kiểm tra cú pháp

- `node --check apps/worker-api/src/core/chat-transport-core.js` pass.
- `node --check apps/worker-api/src/routes/chat.js` pass.
- `node --check apps/fe/js/dashboard/chat.js` pass.
- `python -m py_compile scripts/chat_automation_browser.py scripts/oms-radar-local-helper.py` pass.

### Deploy

- Worker production: `d312aa2b-75d0-4ab8-b45f-bbb8dfa2e276`
- Frontend production: `077c3544-2b3a-4f7a-9a6b-d26bc93685fc`

### Kiểm production thật

- `POST http://127.0.0.1:8765/chat-sync` với `platform=lazada` trả:
  - `ok=false`
  - `error=lazada_automation_removed`
  - `message=Lazada đã bỏ Chrome automation. Chỉ dùng IM API chính thức để tránh lệch session.`
- `GET /api/chat/shops` production sau deploy:
  - Lazada `transport=api`, `chat_transport=api`, `browser_required=0`
  - `transport_guide` đổi đúng thành `Shop không API: chỉ Shopee hoặc TikTok mới dùng Chrome fallback; Lazada không còn fallback local.`
- `POST /api/chat/read` production với hội thoại Lazada `id=103044` trả:
  - `status=ok`
  - `remote_status=ok`
  - `remote_note=Đã đánh dấu đã đọc trên Lazada IM API.`
- `POST /api/chat/send` production ở chế độ `dry_run=true` với hội thoại Lazada `id=103044` trả:
  - `status=ok`
  - `delivery_status=dry_run`
  - `path=/im/message/send`
  - payload có `session_id` chính thức `200006334685_1_200166591213_2_103`
- Chrome thật qua CDP `127.0.0.1:9333`, reload production `chat-marketplace` mobile:
  - modal `Cài đặt chat` hiển thị `Shop có API đi luồng chính thức. Chrome fallback chỉ còn cho Shopee hoặc TikTok; Lazada chỉ dùng IM API chính thức.`
  - `Phạm vi chạy` hiển thị `Shopee hoặc TikTok chưa có API chat chính thức`
  - nút hành động hiển thị đúng:
    - `Mở Chrome Shopee/TikTok`
    - `Chạy automation Shopee/TikTok`
  - card shop Lazada hiển thị `API thật` và liệt kê đúng 3 khả năng đang chạy được:
    - kéo hội thoại/tin nhắn qua IM API
    - gửi text qua IM API
    - đánh dấu đã đọc qua IM API
- `GET /api/chat/conversations?platform=lazada&limit=20` production sau deploy:
  - alias cũ `id=27322` không còn chen lên trước session chính thức
  - session chính thức `id=103065` đã được ưu tiên hiển thị
  - vẫn còn một số thread lịch sử chỉ có `automation-lazada-*` vì IM API chưa trả session chính thức tương ứng, nên chưa xóa bừa dữ liệu gốc

### Trạng thái phase

- `Đã xong`: bỏ hẳn automation local cho Lazada chat, chặn helper local, ép core transport về `api/off`, kiểm thật `mark read`, kiểm `dry_run` gửi text, dọn lớp ưu tiên session chính thức trong danh sách chat.
- `Đang làm dở`: gửi text live từ OMS với câu test an toàn đã chốt; dọn nốt các thread lịch sử chỉ còn `automation-lazada-*`.
- `Bị khóa an toàn`: chưa gửi live tin nhắn test ra khách thật trong lượt này để tránh tạo tin nhắn ngoài ý muốn; mới dừng ở `dry_run` và `mark read` thật.

### Shop có API

- Lazada có app IM + token: chỉ đi `api_chat_worker`, không mở Chrome, `mark read` chạy qua `/im/session/read`, `send text` đã kiểm payload `/im/message/send` ở `dry_run`.
- Shopee có API: không đổi, vẫn ưu tiên `api_chat_worker`.

### Shop không có API

- Chỉ còn Shopee/TikTok đi Chrome fallback/local helper.
- Lazada không còn fallback local; thiếu token/quyền thì khóa sync mới và chỉ giữ dữ liệu đã lưu.

### Vấn đề để tiếp tục

- Chốt một câu test an toàn để gửi live từ OMS rồi xác nhận `send text` Lazada thật.
- Dọn tiếp dữ liệu cũ `automation-lazada-*` cho các thread mà IM API vẫn chưa trả session chính thức.
- Nếu muốn sạch sâu hơn nữa, cần thêm một lượt repair theo `canonical_conversation_id` + buyer/session metadata trực tiếp trong D1.

## 2026-05-07 - thêm tìm kiếm và đồng bộ sản phẩm ngay trong tab Sản phẩm của chat

### Việc đã làm

- Thêm ô tìm trực tiếp trong tab `Sản phẩm` của trang chat, không bắt đội vận hành phải mở modal riêng mới lọc được catalog.
- Ô tìm gọi lại `/api/chat/products` theo đúng `id` hội thoại đang mở để lọc theo `SKU / item_id / tên sản phẩm` trên full catalog API của đúng shop/sàn.
- Thêm nút `Đồng bộ sản phẩm` ngay trong panel phải; nút này gọi `/api/products/sync-api-products` theo đúng `platform + shop` của hội thoại đang chat rồi nạp lại context sau khi đồng bộ xong.
- Vá lỗi poll nền làm mất state tìm kiếm: `openChatConversation(..., { silent: true })` chỉ còn reset panel catalog khi thực sự đổi sang hội thoại khác, không xóa ô tìm khi chỉ refresh cùng thread.

### Kiểm tra cú pháp

- `node --check apps/fe/js/dashboard/chat.js` pass.

### Deploy

- Frontend production: `2e9961c9-dc90-4b87-b50e-4f743697392b`

### Kiểm production thật

- Chrome thật qua CDP `127.0.0.1:9333`, mở production `chat-marketplace` với cache-bust mới.
- Tab `Sản phẩm` của hội thoại `Shopee · chihuy1984` hiện:
  - ô tìm `Tìm tên sản phẩm, SKU, mã item...`
  - nút `Đồng bộ sản phẩm`
- Gọi trực tiếp `filterChatProductPanel('K46_CHAIXITVESINHBEP')` trên production:
  - panel giữ nguyên hội thoại đang mở
  - sau khoảng 2 giây hiện `1/1 sản phẩm khớp · 211 sản phẩm API`
  - không còn bị poll nền xóa ô tìm như trước
- Bấm `Đồng bộ sản phẩm` trên production:
  - panel trả note `Đã đồng bộ 87 sản phẩm · 157 phân loại cho chihuy1984.`
  - catalog sau sync vẫn hiển thị ngay trong tab `Sản phẩm`

### Trạng thái phase

- `Đã xong`: thêm tìm kiếm và đồng bộ catalog ngay trong tab `Sản phẩm` của chat; giữ ổn định state tìm kiếm khi poll nền reload cùng hội thoại.
- `Đang khóa`: TikTok vẫn không có API sản phẩm nên nút sync chỉ là thông báo trạng thái, không giả lập đồng bộ API.

### Shop có API

- Shopee/Lazada có token API: nút `Đồng bộ sản phẩm` kéo lại catalog thật theo shop đang chat rồi nạp lại panel.

### Shop không có API

- TikTok hoặc shop thiếu token: panel vẫn cho xem dữ liệu đã lưu nếu có, nhưng nút sync bị khóa và báo rõ chưa có API sản phẩm hợp lệ.

### Bước tiếp theo

- Nếu muốn thao tác dày hơn, nên thêm luôn nút `Mở kho đầy đủ` trong panel để mở modal catalog lớn mà vẫn giữ nguyên query đang lọc.

## 2026-05-07 - ổn định timeout AI draft Gemini trên chat production

### Việc đã làm

- Sửa `apps/worker-api/src/routes/chat.js` để luồng AI draft:
  - có timeout riêng từng key Gemini bằng `AbortController`
  - xoay key theo vòng tròn thay vì luôn đập từ key đầu tiên
  - chỉ thử tối đa `3` key mỗi lượt để không treo cả request quá lâu
  - rút gọn context prompt: giảm lịch sử chat, knowledge, catalog và advisory trước khi gọi Gemini
- Sửa `apps/fe/js/dashboard/chat.js`:
  - tăng timeout route `/api/chat/ai-draft` lên `40s`
  - ghi rõ trên UI khi hệ thống đang dùng `local-fallback`, không để CSKH hiểu nhầm là Gemini vẫn đang chạy bình thường

### Kiểm tra cú pháp

- `node --check apps/worker-api/src/routes/chat.js` pass.
- `node --check apps/fe/js/dashboard/chat.js` pass.

### Deploy

- Worker production cuối: `4bda45ec-84be-4f51-9541-23f28e55cc02`
- Frontend production cuối: `d9f674ca-25d2-4559-8f85-12cc8c4fd9fe`

### Kiểm production thật

- Dùng Chrome thật qua CDP `127.0.0.1:9333`, mở production `chat-marketplace` với cache-bust mới rồi gọi trực tiếp `generateChatAiReply()` trên hội thoại thật.
- Trước khi siết số lượt thử key:
  - cùng hội thoại Shopee `id=80418` từng ghi nhận `33283 ms` rồi mới rơi về `provider=local-fallback`
  - đây là dấu hiệu request bị kéo dài dây chuyền qua quá nhiều key Gemini
- Sau bản vá cuối:
  - hội thoại Shopee `id=80418` chạy lặp `3` lần liên tiếp: `4745 ms`, `7990 ms`, `6679 ms`
  - cả `3` lượt đều trả `provider=gemini`
- Ca fallback vẫn được giữ an toàn:
  - hội thoại TikTok `id=83995` trả khoảng `20866 ms`
  - `provider=local-fallback`
  - UI production hiện rõ dòng `Gemini chưa phản hồi kịp nên hệ thống đang dùng mẫu an toàn nội bộ`
- Kiểm lại bản frontend cuối:
  - hội thoại Shopee `id=80418` trả draft Gemini khoảng `7302 ms`
  - trạng thái web hiển thị `AI đã tạo bản nháp và qua bộ lọc...`
  - tone trạng thái chuyển `muted` khi rơi về `local-fallback`

### Trạng thái phase

- `Đã xong`: timeout từng key Gemini, xoay key khi chậm/lỗi, nới timeout web và cắt gọn context AI; UI production đã báo rõ khi đang dùng fallback an toàn.
- `Đang làm dở`: phase 2 `AI auto-reply thật`; chưa mở tự gửi live.
- `Bị khóa an toàn`: nếu cả các key Gemini đều chậm/lỗi thì hệ thống vẫn chặn ở mức draft và rơi về mẫu nội bộ, không tự gửi.

### Shop có API

- Shopee/Lazada có API chat vẫn đi luồng API chat như cũ; phần AI draft chỉ hỗ trợ soạn nội dung và nay ổn định hơn ở production.

### Shop không có API

- TikTok hoặc shop thiếu API chat vẫn dùng luồng chat fallback hiện có; nếu Gemini chậm thì vẫn rơi về mẫu an toàn nội bộ và giữ nguyên guard.

### Bước tiếp theo

- Nếu muốn giảm timeout thêm nữa, cần tách riêng quick-reply intent để các câu hỏi lặp phổ biến không phải gọi full Gemini context.
- Sau đó mới nối sang phase `AI auto-reply thật` có điều kiện kích hoạt, log và nút dừng.

## 2026-05-07 - tab Đơn hàng trong chat: sync nền theo shop API, nút sync tay và phân nhóm khớp

### Việc đã làm

- Tách `apps/worker-api/src/core/chat-order-context-core.js` để gom chung capability `shop có API / shop không API`, nhãn nguồn dữ liệu đơn hàng và trạng thái `Đơn khớp chắc / Đơn khớp mềm`.
- Sửa `apps/worker-api/src/routes/chat.js`:
  - context chat trả thêm `order_context` và `soft_orders`
  - khớp cứng trước theo `mã đơn trong chat / thẻ đơn từ API chat`
  - nếu chưa khớp cứng mới khớp mềm theo `customer_name / customer_phone` cùng `platform + shop`
  - lấy mốc `latest_shop_sync_at` và `total_shop_orders` từ `orders_v2` để quyết định có cần sync nền lại không
- Sửa `apps/fe/js/dashboard/chat.js`:
  - tab `Đơn hàng` hiển thị rõ nguồn `Đơn hàng API / Tham chiếu OMS`
  - chỉ shop có API mới có nút `Đồng bộ đơn hàng`
  - chia card `Đơn khớp chắc` và `Đơn khớp mềm, cần kiểm tra`
  - sync tay và sync nền đều chỉ kéo đúng `platform + shop` qua route advanced features
- Sửa `apps/worker-api/src/index.js` giữ thêm alias `/api/features` và `/api/actions` về `handleAdvancedApiFeatures` để frontend/cache cũ không rơi `404 Not found`.

### Kiểm tra cú pháp

- `node --check apps/worker-api/src/core/chat-order-context-core.js` pass.
- `node --check apps/worker-api/src/routes/chat.js` pass.
- `node --check apps/worker-api/src/index.js` pass.
- `node --check apps/fe/js/dashboard/chat.js` pass.

### Deploy

- Worker production cuối: `43f06cc8-ef08-4aac-9ac7-241c1827af89`
- Frontend production cuối: `695da0aa-94fa-41f9-9597-c13f7f7069b3`

### Kiểm production thật

- Dùng Chrome thật qua CDP `127.0.0.1:9333`, mở production `chat-marketplace`.
- Case shop có API:
  - backend tìm được hội thoại Shopee `id=102883`, shop `chihuy1984`
  - `order_context` production trả:
    - `can_sync=true`
    - `source_label=Đơn hàng API`
    - `match_state_label=Đơn khớp chắc`
    - `hard_count=1`
  - tab `Đơn hàng` trên web hiển thị:
    - nguồn dữ liệu `Đơn hàng API. Đơn khớp chắc.`
    - nút `Đồng bộ đơn hàng`
    - card `Đơn khớp chắc`
  - gọi nhánh sync nền `auto=true` và sync tay đều thành công:
    - `fetched=80`
    - `imported_orders=80`
    - `imported_items=82`
    - note trên web hiển thị `Đã đồng bộ 80 đơn, lưu 80 đơn và 82 dòng sản phẩm cho chihuy1984.`
- Case shop không API:
  - backend tìm được hội thoại TikTok `id=83995`, shop `0909128999`
  - `order_context` production trả:
    - `can_sync=false`
    - `source_label=Tham chiếu OMS`
    - `match_state_label=Chưa khớp đơn`
  - tab `Đơn hàng` trên web hiển thị:
    - nguồn dữ liệu `Tham chiếu OMS. Chưa khớp đơn.`
    - nút disabled `Chưa có API đơn hàng`
    - không hiện bừa đơn mới nhất của shop

### Trạng thái phase

- `Đã xong`: tab `Đơn hàng` trong chat đã tách rõ shop API / không API, có nút sync tay cho shop API, có nhánh sync nền theo `platform + shop`, có phân nhóm `Đơn khớp chắc / Đơn khớp mềm, cần kiểm tra`.
- `Đã xong`: vá lỗi production `Not found` khi bấm sync do frontend gọi `/api/features` chưa có route; nay frontend đi route chuẩn và worker giữ alias tương thích.
- `Đang làm dở`: chưa có nút `Nhắn khách` từ OMS nhảy thẳng sang hội thoại tương ứng; chưa có resolver dùng `buyer_id` vì `orders_v2` hiện chưa có buyer id chuẩn để dùng chung.
- `Bị khóa an toàn`: nếu chưa khớp chắc thì vẫn không tự lôi đơn mới nhất khác khách vào panel.

### Shop có API

- Shopee/Lazada có API đơn hàng: tab `Đơn hàng` cho phép sync tay và sync nền incremental theo đúng `platform + shop`; context đọc lại từ `orders_v2` và `order_items`.

### Shop không có API

- TikTok hoặc shop thiếu token/order API: tab `Đơn hàng` chỉ đọc OMS hiện có hoặc fallback riêng, nút sync bị khóa và hiện rõ `Chưa có API đơn hàng`.

### Bước tiếp theo

- Nối nút `Nhắn khách` từ OMS sang đúng hội thoại chat theo `platform + shop + order resolver`.
- Nếu muốn tăng độ chính xác khớp mềm, cần bổ sung `buyer_id` chuẩn vào luồng import `orders_v2` rồi mới mở rộng thêm rule match.

## 2026-05-07 - Lazada 2 app riêng: UI quản trị `API chính` và `Chat API`

### Việc đã làm

- Sửa `apps/worker-api/src/core/marketplace-shop-capability-core.js` để `api-configs` trả thêm:
  - `has_chat_access_token`
  - `has_chat_refresh_token`
  - `chat_token_expire_at`
  - `chat_api_connected_at`
  - `chat_api_refresh_expire_at`
  - `chat_last_api_refresh_at`
- Sửa `apps/worker-api/src/routes/shops.js`:
  - thêm route `POST /api/shops/disconnect-chat-api`
  - chỉ xóa bộ token chat Lazada (`chat_access_token`, `chat_refresh_token`, `chat_token_expire_at`, `chat_api_*`)
  - không đụng vào `access_token` Lazada API chính
- Sửa `apps/fe/js/admin/var-shops.js`:
  - dòng Lazada trong `Kết nối & Đồng bộ` tách thành 2 khối `Lazada API chính` và `Lazada Chat API`
  - hiển thị hạn token từng app
  - thêm nút `Gia hạn Lazada`, `Gia hạn chat`, `Đồng bộ chat`, `Ngắt API chính`, `Ngắt chat`
  - `Đồng bộ chat` gọi thật `/api/chat/api-sync` theo đúng shop Lazada
- Sửa `apps/fe/js/dashboard/chat.js`:
  - `Cài đặt chat` hiển thị riêng khối `Lazada Chat API` trong từng shop Lazada
  - phân biệt `đã kết nối / sắp hết hạn / đã hết hạn`
  - thêm nút `Kết nối lại Chat API`, `Đồng bộ chat`, `Ngắt chat`
  - giữ lại thông báo kết quả sau khi modal refresh, không bị trả về câu nhắc mặc định ngay

### Kiểm tra cú pháp

- `node --check apps/worker-api/src/core/marketplace-shop-capability-core.js` pass.
- `node --check apps/worker-api/src/routes/shops.js` pass.
- `node --check apps/fe/js/admin/var-shops.js` pass.
- `node --check apps/fe/js/dashboard/chat.js` pass.
- `wrangler deploy --dry-run` pass cho cả worker và frontend trước khi deploy thật.

### Deploy

- Worker production cuối: `9e47a616-ccf6-4cf8-8463-23db821851e0`
- Frontend production cuối: `15ba4a5a-eb95-4cef-bfcf-49571077b071`

### Kiểm production thật

- Gọi production `GET /api/shops/api-configs`:
  - shop Lazada `kinhdoanhonlinegiasoc@gmail.com` đã trả đủ:
    - `has_chat_access_token=1`
    - `has_chat_refresh_token=1`
    - `chat_token_expire_at=2026-06-06T08:43:54.476Z`
    - `chat_api_connected_at=2026-05-07 08:43:55`
    - `chat_api_refresh_expire_at=2026-11-03T08:43:54.476Z`
- Gọi production `GET /api/chat/shops`:
  - shop Lazada có `transport=api`
  - `chat_api_status=ready`
  - `conversations=27`
- Kiểm bằng Chrome thật qua CDP `127.0.0.1:9333` trên production `admin-products.html#shops`:
  - dòng Lazada hiện 2 khối riêng `Lazada API chính` và `Lazada Chat API`
  - khối chat hiện đúng:
    - `✅ Chat API đã kết nối`
    - `Token chat còn 29 ngày 19 giờ`
    - `Gia hạn chat còn 179 ngày 19 giờ`
  - nhóm nút hiện đủ:
    - `🔗 Gia hạn Lazada`
    - `💬 Gia hạn chat`
    - `Đồng bộ chat`
    - `Ngắt chat`
- Mở thật route reconnect chat:
  - `https://huyvan-worker-api.nghiemchihuy.workers.dev/api/auth/lazada/chat/url`
  - browser redirect đúng sang:
    - `https://auth.lazada.com/oauth/authorize?...client_id=138495...redirect_uri=.../channels/lazada/chat/callback`
- Kiểm bằng Chrome thật qua CDP trên production `chat-marketplace.html`:
  - `Cài đặt chat` của shop Lazada hiện khối `Lazada Chat API`
  - có đủ nút:
    - `Kết nối lại Chat API`
    - `Đồng bộ chat`
    - `Ngắt chat`
  - chạy thật `syncLazadaChatApiFromSettings(10)`:
    - guard status cuối giữ lại `Đã đồng bộ chat Lazada: 0 hội thoại · 0 tin nhắn.`
    - tone `chat-guard-status ok`

### Trạng thái phase

- `Đã xong`: UI quản trị Lazada đã tách riêng `API chính` và `Chat API` ở cả `Kết nối & Đồng bộ` và `Cài đặt chat`.
- `Đã xong`: reconnect chat Lazada đã có đường đi vận hành rõ ràng trên production; không còn phải nhớ link ẩn.
- `Đã xong`: sync chat Lazada từ `Cài đặt chat` đã bấm thật và báo kết quả rõ.
- `Đang làm dở`: chưa mở gửi text live Lazada qua IM API cho khách thật.
- `Bị khóa an toàn`: chưa bấm `Ngắt chat` trên production đang chạy để tránh tự xóa token đang dùng; mới kiểm thật bằng route reconnect và sync read-only.

### Shop có API

- Lazada có 2 app riêng:
  - `API chính`: đơn hàng / sản phẩm / logistics / finance
  - `Chat API`: IM Chat
- UI production hiện đã tách rõ từng app, từng hạn token và từng nút vận hành.

### Shop không có API

- Không đổi: chỉ đi luồng tham chiếu OMS hoặc fallback riêng, không gắn nhãn `đồng bộ API`.

### Bước tiếp theo

- Thêm nút `Nhắn khách` từ OMS sang đúng hội thoại theo `platform + shop + order resolver`.
- Chuyển phần phí sàn về `API-first` tuyệt đối cho shop có API; chỉ dùng `cost setting` khi bucket đó không lấy được từ API hoặc là chi phí nội bộ.

## 2026-05-07 - chat cleanup Shopee: bỏ `Shopee gom...`, FAQ hệ thống và placeholder đa ngôn ngữ

### Việc đã làm

- Sửa `apps/worker-api/src/routes/chat.js` để chặn ngay từ lõi các row Shopee không phải tin chat thật:
  - `bundle_message` kiểu `Shopee gom ... tin tự động trong phiên chat`
  - cụm FAQ hệ thống `new_faq / faq_liveagent / Chat với Người bán`
  - prompt đánh giá đa ngôn ngữ chứa `{placeholder}` và `Shopee Coins`
- Luồng sync Shopee không còn dùng cách mò mảng con dài nhất cho `message_list`; nay ưu tiên đúng path top-level `response.message_list / response.messages` để khỏi kéo nhầm mảng template con.
- Luồng webhook Shopee gặp `bundle_message` sẽ bỏ row tóm tắt giả và backfill lại hội thoại qua API thay vì ghi đè vào luồng chat.
- Sửa `apps/fe/js/dashboard/chat.js` để preview và thread chỉ hiển thị tin chat thật; nếu còn row hệ thống cũ thì UI cũng tự ẩn, không làm đội CSKH đọc nhầm.
- Dọn dữ liệu bẩn production D1:
  - xóa `41` row rác Shopee gồm `Shopee gom ...`, `new_faq`, `faq_liveagent`, `Chat với Người bán`, `{placeholder}`
  - dựng lại `last_message / last_message_at` cho `166` hội thoại Shopee từ tin còn lại

### Kiểm tra cú pháp

- `node --check apps/worker-api/src/routes/chat.js` pass.
- `node --check apps/fe/js/dashboard/chat.js` pass.

### Deploy

- Worker production cuối: `9faebd2a-bf84-4651-8482-5c9cef023799`
- Frontend production cuối: `747742f0-2611-496d-b906-db5543630b3b`

### Đã kiểm tra thực tế

- Chạy thật production `POST /api/chat/sync` với `limit=120`:
  - `scanned=120`
  - `inserted=0`
  - xác nhận webhook cũ không tái sinh lại row rác
- Kiểm production D1 sau cleanup:
  - `bundle_summary_rows=0`
  - `placeholder_rows=0`
  - `faq_rows=0`
- Dùng Chrome thật qua CDP `127.0.0.1:9333`, mở production `chat-marketplace.html` và kiểm lại đúng 2 hội thoại lỗi:
  - `tangtu1992`
  - `mumcuacun`
- Kết quả trên web thật:
  - không còn `Shopee gom ... tin tự động trong phiên chat`
  - không còn `{placeholder}`
  - không còn `Chat với Người bán`
  - không còn cụm `Shopee Coins`
  - preview hội thoại đã quay về tin khách thật

### Trạng thái phase

- `Đã xong`: chặn tái sinh dữ liệu rác chat Shopee từ cả sync API lẫn webhook.
- `Đã xong`: dọn sạch row rác cũ trên production để UI không còn báo lỗi giả nữa.
- `Đã xong`: OMS không còn ẩn kiểu “gom tin” làm shop không biết AI/chat đã trao đổi gì; luồng chat hiện lại tin thật còn lưu trong D1.
- `Đang làm dở`: chưa truy nguyên được chính xác khối tiếng Anh trong ảnh `Lịch sử Hỏi - Đáp` từ screenshot 3 ở ngoài sàn; trong OMS đã xác nhận và dọn được lớp dữ liệu cùng nhóm `FAQ/prompt hệ thống`.
- `Bị khóa an toàn`: chưa mở auto-reply gửi live hàng loạt; vẫn ưu tiên để người vận hành nhìn rõ nội dung trước.

### Shop có API

- Shopee có API/chat token: sync và webhook nay chỉ lưu tin chat thật, bỏ prompt hệ thống.
- Lazada có API chat riêng: giữ nguyên luồng IM API như phase trước, không fallback Chrome.

### Shop không có API

- TikTok hoặc shop thiếu API chat: vẫn đi fallback/browser riêng như cũ, nhưng lớp UI mới cũng sẵn sàng ẩn bớt tin hệ thống nếu có.

### Bước tiếp theo

- Truy dấu riêng ảnh `Lịch sử Hỏi - Đáp` screenshot 3 nếu còn xuất hiện ngoài OMS để xác nhận đó là dữ liệu platform-side hay còn một nhánh local helper chưa chặn hết.
- Quay lại phase `phí sàn API-first` và nút `Nhắn khách` từ đơn hàng sau khi chat đã ổn định lại.

## 2026-05-07 - OMS phí sàn phase 1 API-first trên production

### Việc đã làm

- Vá `apps/worker-api/src/core/order-fee-phase1-core.js` để nếu đơn đã có `order_fee_details` thật trong D1 thì OMS vẫn ưu tiên coi là `API-first`, kể cả khi bảng capability của shop chưa refresh kịp.
- Giữ rule phase 1 theo đúng hướng đã chốt:
  - shop có API: ưu tiên `Phí sàn từ API` + `Thuế/khấu trừ từ API`, bucket nào thiếu mới lấy `cost setting` và đưa vào `Ước tính còn thiếu`
  - shop không API: toàn bộ đi `cost setting`, gắn nhãn rõ `Phí cost setting`
- Sửa `apps/fe/js/modules/oms-render.js` để popup phí trên OMS không còn đọc nhánh cũ `fee_platform / fee_service` theo kiểu gom tay nữa; nay đọc trực tiếp `fee_breakdown` từ backend và hiển thị 4 nhóm:
  - `Phí sàn từ API`
  - `Thuế/khấu trừ từ API`
  - `Chi phí nội bộ`
  - `Ước tính còn thiếu`
- Bổ sung ghi chú phase 1 ngay trong popup:
  - badge `Phí API thật / Phí API + ước tính / Phí cost setting`
  - note nguồn dữ liệu
  - chênh lệch giữa `orders_v2` cũ và breakdown phase 1 nếu có
- Bump cache frontend qua:
  - `apps/fe/js/oms-main.js`
  - `apps/fe/pages/oms-dashboard.html`
- Chạy cleanup production `POST /api/orders/cleanup-fee-phase1` để ghi lại `fee/profit_real/profit_invoice` cho các đơn đang bị lệch.

### Kiểm tra cú pháp

- `node --check apps/worker-api/src/core/order-fee-phase1-core.js` pass.
- `node --check apps/fe/js/modules/oms-render.js` pass.
- `node --check apps/fe/js/oms-main.js` pass.

### Deploy

- Worker production cuối: `d5be85a7-959f-4906-8722-ccf59a2f961b`
- Frontend production cuối: `634d2438-8317-4890-81d8-d7a919c7a663`

### Đã kiểm tra thực tế

- Gọi thật production `POST /api/orders/cleanup-fee-phase1`:
  - `scanned=9578`
  - `updated=1404`
  - `mode_stats.api=853`
  - `mode_stats.mixed=5263`
  - `mode_stats.estimate=3462`
- Gọi thật production `GET /api/orders?page=1&limit=3` xác nhận response OMS đã có:
  - `fee_breakdown.groups`
  - `fee_breakdown.totals`
  - `fee_display_total`
  - `fee_display_status`
  - `fee_display_note`
- Dùng Chrome thật qua CDP `127.0.0.1:9333`, mở production `oms-dashboard` và bấm popup phí trên đơn thật:
  - Case shop có API `Shopee / chihuy1984 / order_id=260507S7BGNWY9`
    - badge hiện `Phí API + ước tính`
    - popup hiện đúng:
      - `Phí sàn từ API`
      - `Thuế/khấu trừ từ API`
      - `Ước tính còn thiếu`
    - dữ liệu đơn này hiển thị:
      - `api_fee=12.310đ`
      - `api_tax=735đ`
      - `estimate=4.900đ`
      - `total=17.945đ`
  - Case shop không API `Shopee / phambich2312 / order_id=260507R6SVTSPU`
    - badge hiện `Phí cost setting`
    - popup ghi rõ `Shop chưa có API phí sàn. OMS đang lấy toàn bộ phí từ cost setting.`
    - toàn bộ breakdown nằm trong nhóm `Ước tính còn thiếu`

### Trạng thái phase

- `Đã xong`: OMS phase 1 `API-first` đã chạy thật trên production, popup phí đọc từ core breakdown thay vì nhánh cũ.
- `Đã xong`: dữ liệu bẩn `orders_v2` lệch giữa nhánh cũ và phase 1 đã được cleanup thật cho `1404` đơn.
- `Đang làm dở`: phase 2 thay `calcProfit()` legacy và các route cũ để các màn khác không tái sinh pha trộn `API + cost setting`.
- `Bị khóa an toàn`: Lazada Finance transaction detail vẫn chưa có dữ liệu production thật vì app production còn thiếu quyền `/finance/transaction/detail/get`.

### Shop có API

- Shopee có Payment API / escrow detail:
  - OMS đã ưu tiên bucket phí thật và thuế thật từ `order_fee_details`
  - phần thiếu như `fee_ads` nếu API chưa trả sẽ đi `cost setting` và bị dán nhãn `Ước tính còn thiếu`
- Lazada có API chính:
  - core đã sẵn cho `order_fee_details`
  - nhưng production còn chờ quyền Finance transaction detail nên hiện tại OMS chỉ có thể `API-first` khi đã có bucket thật trong D1; phần thiếu vẫn rơi về ước tính

### Shop không có API

- Shop không có API phí sàn vẫn dùng `cost setting`, hiển thị rõ `Phí cost setting`, không giả là `Phí API`.

### Bước tiếp theo

- Phase 2: thay `calcProfit()` trong `apps/worker-api/src/utils/db.js` và các route legacy để toàn hệ thống dùng chung source of truth phase 1, không còn tái sinh giá trị cũ vào `orders_v2`.
- Sau đó mới quay lại nút `Nhắn khách` từ OMS sang đúng hội thoại hoặc tạo hội thoại mới khi chưa có thread.

## 2026-05-07 - chat order context: vá khớp mềm theo tên buyer thật trong message

### Việc đã làm

- Vá `apps/worker-api/src/routes/chat.js` để core khớp đơn của chat không còn chỉ tin `conversation.buyer_name` nữa.
- Nếu row hội thoại API bị lưu lệch thành `buyer_name = buyer_id số`, backend sẽ quét lại `sender_name` của tin buyer trong thread để dựng `buyer lookup` chuẩn trước khi khớp đơn OMS.
- Route `GET /api/chat/context` cũng làm giàu lại `conversation.buyer_name` từ message buyer mới nhất, để UI chat và core khớp đơn cùng đọc một nguồn tên khách.
- Giữ nguyên rule an toàn:
  - khớp cứng theo mã đơn hoặc thẻ đơn nếu có
  - chỉ khi không có khớp cứng mới mở `Đơn khớp mềm, cần kiểm tra`
  - không tự lôi đơn mới nhất khác khách vào panel

### Kiểm tra cú pháp

- `node --check apps/worker-api/src/routes/chat.js` pass.

### Deploy

- Worker production cuối: `5685853c-8959-47da-9c08-99832d91f5b4`
- Frontend không cần deploy thêm trong phase này vì UI production đã có sẵn nhánh render `Đơn khớp mềm`; lỗi nằm ở dữ liệu context từ backend.

### Đã kiểm tra thực tế

- Gọi production `GET /api/chat/context?platform=shopee&shop=chihuy1984&conversation_id=730346497255025858`:
  - `conversation.buyer_name = tangtu1992`
  - `order_context.match_state = soft`
  - `order_context.soft_count = 1`
  - `soft_orders[0].order_id = 260507R23466HH`
- Gọi production `GET /api/orders?platform=shopee&shop=chihuy1984&search=tangtu1992&page=1&page_size=20` để đối chiếu source of truth OMS:
  - có thật đơn `260507R23466HH`
  - `customer_name = tangtu1992`
- Dùng Chrome thật qua CDP `127.0.0.1:9333`, mở production `chat-marketplace` với cache tắt và vào đúng hội thoại `tangtu1992`:
  - tab `Đơn hàng` hiện `Nguồn dữ liệu đơn hàng: Đơn hàng API. Đơn khớp mềm, cần kiểm tra.`
  - hiện đúng card đơn `260507R23466HH`
  - hiện đúng trạng thái `đã hoàn thành`
  - không còn rơi về màn `Chưa khớp đơn` như case người dùng báo

### Trạng thái phase

- `Đã xong`: vá lỗi shop có API bấm `Đồng bộ đơn hàng` nhưng hội thoại vẫn trống do `buyer_name` conversation bị lệch thành id số.
- `Đã xong`: xác nhận trên web production thật case `tangtu1992` đã nhìn thấy đơn `260507R23466HH` trong tab `Đơn hàng`.
- `Đang làm dở`: vẫn còn cần dọn riêng nhánh Shopee system notification `join`/JSON lọt vào preview hội thoại ở vài case khác.

### Shop có API

- Shopee/Lazada có API đơn hàng: tab `Đơn hàng` nay khớp lại được cả khi tên khách chỉ còn nằm trong message buyer, không bắt buộc row hội thoại phải giữ đúng `buyer_name` ngay từ đầu.

### Shop không có API

- Không đổi: TikTok hoặc shop thiếu API đơn hàng vẫn chỉ đọc OMS hiện có hoặc fallback riêng; không gắn nhãn `Đồng bộ API`.

### Bước tiếp theo

- Làm phase dọn dữ liệu chat Shopee `notification_type=join` và placeholder debug để preview hội thoại không còn lẫn event hệ thống.
- Sau đó mới quay lại cụm `Nhắn khách` từ OMS, gồm cả nhánh tạo hội thoại mới khi chưa có thread.

## 2026-05-07 - calcProfit legacy dùng chung phase 1 và nút `Nhắn khách` từ OMS seed hội thoại mới

### Việc đã làm

- Sửa `apps/worker-api/src/core/order-fee-phase1-core.js` để phase 1 không chỉ phục vụ popup OMS nữa mà trở thành nguồn số liệu chung cho:
  - `calcProfit()` legacy
  - route `orders`
  - route `api-sync`
  - `dashboard priceCalc`
- Thêm các helper chung:
  - `buildOrderFeePhase1Context(...)`
  - `applyOrderFeePhase1ToOrderRow(...)`
  - `buildOrderFeePhase1ProfitResult(...)`
- Đổi `apps/worker-api/src/utils/db.js` để `calcProfit(order, cfg)` không còn tự pha bucket phí bằng tay; nay trả thẳng kết quả từ `order-fee-phase1-core`.
- Bỏ nhánh vá cục bộ bị trùng trong `apps/worker-api/src/routes/orders.js`; route OMS cũ nay đọc chung một source of truth phase 1.
- Mở rộng `apps/worker-api/src/routes/chat.js` cho nút `💬 Nhắn khách` từ OMS:
  - nếu đã có hội thoại thì mở đúng thread
  - nếu chưa có hội thoại thì tạo `oms_order_seed` theo `platform + shop + order`
  - trả về cảnh báo rõ theo từng sàn để UI biết khi nào cần fallback local
- Sửa `apps/fe/js/dashboard/chat.js` để nhánh `created` vẫn được coi là mở thành công, prefill câu mở đầu và giữ guard đúng ngữ cảnh.
- Làm sạch script kiểm thử thực tế `scripts/check-order-chat-resolver-cdp.mjs` để kiểm được cả nhánh `hard / soft / created` trên production.
- Thêm script `scripts/check-oms-fee-phase1-cdp.mjs` để kiểm popup phí thật trên OMS bằng Chrome CDP, không chỉ nhìn JSON API.

### Kiểm tra cú pháp

- `node --check apps/worker-api/src/core/order-fee-phase1-core.js` pass.
- `node --check apps/worker-api/src/utils/db.js` pass.
- `node --check apps/worker-api/src/routes/orders.js` pass.
- `node --check apps/worker-api/src/routes/chat.js` pass.
- `node --check apps/fe/js/dashboard/chat.js` pass.
- `node --check apps/fe/js/modules/oms-actions.js` pass.
- `node --check scripts/check-order-chat-resolver-cdp.mjs` pass.
- `node --check scripts/check-oms-fee-phase1-cdp.mjs` pass.

### Deploy

- Worker production: `d29c1836-5cf6-419f-a1d1-d37d4f1a4622`
- Frontend production: `69912914-76a3-47d0-bd09-eb89e8c59fe2`

### Đã kiểm tra thực tế

- Dùng Chrome thật qua CDP `127.0.0.1:9333`, mở production `oms-dashboard` và `chat-marketplace`, thao tác trực tiếp trên web thật.
- Kiểm popup phí OMS cho nhánh shop có API:
  - production render badge `Phí API + ước tính: 26.810đ`
  - dropdown hiện đúng 3 nhóm `Phí sàn từ API 19.140đ`, `Thuế/khấu trừ từ API 1.170đ`, `Ước tính còn thiếu 6.500đ`
  - có ghi chú phase 1 về phần bucket còn thiếu đang lấy từ `cost setting`
- Kiểm popup phí OMS cho nhánh shop không API:
  - đơn `260507R6SVTSPU` của `phambich2312` hiện `Phí cost setting: 33.420đ`
  - dropdown chỉ còn nhóm `Ước tính còn thiếu`, không giả là phí API
- Kiểm nút `💬 Nhắn khách` nhánh đã có hội thoại:
  - đơn `260507R23466HH`
  - resolver trả `match_type=hard`
  - web production mở đúng hội thoại `tangtu1992`
  - ô soạn được prefill `Dạ shop đang liên hệ lại về đơn 260507R23466HH...`
- Kiểm nút `💬 Nhắn khách` nhánh chưa có hội thoại:
  - đơn `260507RDRRDHK4`
  - resolver trả `match_type=created`
  - backend seed hội thoại `automation-shopee-seed-or6a3c`
  - web production mở đúng thread mới, prefill câu mở đầu và hiện guard `nếu Shopee API chưa có buyer_id thật thì hệ thống sẽ fallback automation local khi bấm Gửi`

### Trạng thái phase

- `Đã xong`: `calcProfit()` legacy và các route cũ đã dùng chung source of truth phase 1; OMS production vẫn render đúng popup phí cho cả shop API và shop không API.
- `Đã xong`: nút `💬 Nhắn khách` từ OMS đã mở đúng hội thoại hoặc seed hội thoại mới khi chưa có thread.
- `Đã xong`: nhánh tạo hội thoại mới đã kiểm thật trên production, không còn dừng ở mức chỉ trả cảnh báo rồi đứng im.
- `Đang làm dở`: chưa gửi live từ hội thoại seed mới trong case Shopee thiếu `buyer_id`; hiện tại mới mở thread + prefill + guard đúng để nhân viên kiểm rồi gửi.
- `Bị khóa an toàn`: Lazada vẫn chỉ được gửi chat chính thức khi IM session/token hợp lệ; seed thread không vượt qua guard này.

### Shop có API

- Shop có API phí sàn:
  - bucket phí thật và thuế thật lấy từ `order_fee_details`
  - bucket thiếu mới rơi vào `Ước tính còn thiếu`
  - `calcProfit()` cũ không còn tự pha logic riêng nên các route cũ và OMS đọc cùng một lõi
- Shop có API chat:
  - nếu đã có hội thoại thật thì OMS mở thẳng đúng thread
  - nếu chưa có thread thì OMS seed hội thoại mới để đội CSKH bắt đầu xử lý ngay
  - Shopee seed thread vẫn báo rõ khả năng fallback local nếu chưa có `buyer_id`

### Shop không có API

- Shop không có API phí sàn:
  - vẫn dùng `cost setting`
  - UI ghi rõ `Phí cost setting`, không gắn nhãn API
- Shop không có API chat:
  - OMS vẫn có thể seed hội thoại nội bộ để đội vận hành chuẩn bị câu trả lời
  - việc gửi thật vẫn đi theo fallback/browser riêng của từng sàn, không giả là realtime API

### Bước tiếp theo

- Dọn phase dữ liệu chat hệ thống Shopee `notification_type=join` và placeholder debug còn sót, để preview/thread không lẫn event hệ thống.
- Sau đó mới quay lại nhánh gửi thật từ hội thoại seed mới, gồm:
  - Shopee seed thread + fallback local khi thiếu `buyer_id`
  - TikTok seed thread + automation local ổn định hơn, có chống quét lặp nội dung.

## 2026-05-08 - TikTok chat dedupe thread-first và cleanup dữ liệu lặp

### Việc đã làm

- Sửa `scripts/chat_automation_browser.py` để TikTok chỉ dùng `preview` làm tín hiệu phát hiện hội thoại đổi; khi đã mở sâu thread thì không nhập kép `preview + thread` nữa.
- Đổi fingerprint TikTok ở cả Python và Worker sang khóa theo `conversation_id + sender_type + nội dung/media`, không dùng `sent_at`, vì TikTok fallback thường gán lại thời gian lúc quét chứ không trả timestamp thật của bubble.
- Giữ cleanup theo conversation trong `apps/worker-api/src/routes/chat.js`, nhưng nay cleanup được cả dữ liệu lặp giữa nhiều lượt quét cũ và mới.
- Thêm script kiểm production `scripts/check-tiktok-chat-dedupe-cdp.mjs` để mở đúng hội thoại TikTok lỗi qua Chrome CDP, đọc preview/timeline và kiểm số dòng trùng.

### Kiểm tra cú pháp

- `python -m py_compile scripts/chat_automation_browser.py` pass.
- `node --check apps/worker-api/src/routes/chat.js` pass.
- `node --check scripts/check-tiktok-chat-dedupe-cdp.mjs` pass.

### Deploy

- Worker production: `bd9a45b2-1339-484b-b439-2d5dcac39fea`
- Helper local không cần restart service riêng; `/chat-sync` đang chạy `scripts/chat_automation_browser.py` mới theo từng request.

### Kiểm production thật

- Gọi cleanup production lần 1 qua session admin:
  - `POST /api/chat/admin/cleanup-tiktok-duplicates`
  - `shop=0909128999`
  - `scanned=35`
  - `affected_conversations=8`
  - `deleted_messages=163`
- Sau khi đổi fingerprint bỏ `sent_at`, gọi cleanup production lần 2:
  - `scanned=35`
  - `affected_conversations=5`
  - `deleted_messages=153`
- Chạy lại automation TikTok thật qua helper local:
  - `POST http://127.0.0.1:8765/chat-sync`
  - `platform=tiktok`
  - `shop=0909128999`
  - `scan_mode=browser_thread_detail`
  - `expand_browser_viewport=true`
  - kết quả production:
    - `deep_scan=true`
    - `received_messages=5`
    - `accepted_messages=5`
    - `saved_messages=5`
- Mở lại production `chat-marketplace` bằng Chrome thật qua CDP, lọc `TikTok + t_thzy2`:
  - preview chỉ còn 1 câu cuối: `Mà giờ giao hàng không thành công Shipper hủy r nên là shop hoàn tiền lại giúp em với ạ`
  - timeline còn đúng `5` dòng thật
  - `duplicates=[]`
  - không còn lặp chuỗi `18:14 / 18:15 / 18:19 / 18:20 / 18:25 / 18:26 / 18:30 / 18:31 / 18:37 / 00:31`
  - screenshot kiểm thật lưu tại `E:/shophuyvan-analytics/tmp-tiktok-dedupe-verify-final.png`

### Trạng thái phase

- `Đã xong`: khóa trùng TikTok ở đầu vào theo `thread-first`, bỏ nhập kép preview/thread, cleanup dữ liệu lặp trong D1, kiểm lại hội thoại lỗi trên production thật.
- `Đã xong`: shop TikTok không API vẫn đi browser fallback nhưng đã bớt import rác và không còn nhân bản cả cụm hội thoại sau mỗi lượt quét.
- `Đang làm dở`: vẫn còn cụm dữ liệu hệ thống/placeholder ở một số hội thoại Shopee, không cùng gốc với TikTok lặp.

### Shop có API

- Không đổi trong phase này. Shop có API chat vẫn ưu tiên `api_chat_worker`, không đi qua nhánh dedupe TikTok fallback.

### Shop không có API

- TikTok và các shop Shopee chưa có API chat chính thức vẫn dùng browser fallback.
- Riêng TikTok fallback nay:
  - preview chỉ để phát hiện hội thoại có thay đổi
  - thread là nguồn tin nhắn thật
  - cleanup nội bộ xóa row trùng trước khi CSKH nhìn trên web

### Bước tiếp theo

- Dọn tiếp dữ liệu hệ thống Shopee `notification_type=join` và placeholder debug đang lọt vào timeline chat.
- Sau đó mới quay lại nhánh gửi thật từ hội thoại seed mới và phần ổn định TikTok/Shopee fallback sâu hơn nếu còn phát sinh thread lặp mới.


## 2026-05-08 - D?n UI chat ??n h?ng, s?a font n?t Nh?n kh?ch v? ??a sync ra header

### Vi?c ?? l?m

- S?a `apps/fe/js/modules/oms-render.js` ?? n?t m? chat t? OMS hi?n th? ??ng `Nh?n kh?ch`, kh?ng c?n l?i m? h?a ? c?t `Shop / KH`.
- S?a `apps/fe/js/dashboard/chat.js` ?? tab `??n h?ng` ch? c?n card d? li?u ??n, b? c?m note v?ng d?i v? b? toolbar sync kh?i panel ph?i.
- Th?m action sync ??n h?ng v?o header h?i tho?i b?ng class `chat-thread-sync-btn`; ch? hi?n khi shop c? API ??n h?ng.
- ?p header chat rerender l?i ngay sau khi context ??n h?ng t?i xong, k? c? khi thread seed ho?c thread ?t tin, ?? n?t sync kh?ng b? m?t do race gi?a messages/context.
- S?a `apps/fe/css/dashboard.css` ?? header chat c? v?ng `chat-thread-controls` m?i, gi? b? c?c g?n cho desktop v? mobile.
- ??i d?ng meta trong card ??n sang d?u ph?n t?ch `|` ?? tr?nh l?i k? t? `?` ? runtime/CDP.

### Ki?m tra c? ph?p

- `node --check apps/fe/js/dashboard/chat.js` pass.
- `node --check apps/fe/js/modules/oms-render.js` pass.

### Deploy

- Frontend production ?? deploy l?i nhi?u l??t trong ng?y ?? ch?t ??ng Unicode v? b? c?c cu?i.
- Frontend version cu?i: `431f68d6-8c5c-4a7b-8a26-561bc907b5b5`

### Ki?m production th?t

- D?ng Chrome th?t qua CDP `127.0.0.1:9333` m? `oms-dashboard.html` production:
  - n?t ? c?t `Shop / KH` hi?n ??ng `Nh?n kh?ch`.
- M? `chat-marketplace.html` production, v?o h?i tho?i `tangtu1992`:
  - header hi?n n?t `??ng b? ??n h?ng`.
  - panel ph?i kh?ng c?n `chat-context-note` v?ng (`noteCount=0`).
  - kh?ng c?n toolbar sync trong panel (`toolbarInPanel=false`, `syncButtonInPanel=false`).
  - meta card ??n hi?n `07/05 11:21 | shopee | chihuy1984`.

### Tr?ng th?i phase

- `?? xong`: d?n UI tab `??n h?ng` trong chat, ??a sync l?n header, s?a font n?t `Nh?n kh?ch` trong OMS.
- `?? xong`: shop c? API ??n h?ng nh?n th?y n?t sync ? header h?i tho?i, kh?ng c?n ph?i b?m trong panel h?p.
- `?ang kh?a`: shop kh?ng API ??n h?ng v?n kh?ng hi?n n?t sync, ch? ??c d? li?u OMS/fallback s?n c?.

### Shop c? API

- OMS: b?m `Nh?n kh?ch` m? ??ng chat nh? phase resolver ?? l?m tr??c ??.
- Chat: ??ng b? ??n h?ng b?m t? header h?i tho?i, context ??n h?ng v?n ??c t? `orders_v2` / `order_items` theo core hi?n t?i.

### Shop kh?ng c? API

- OMS v?n c? th? m? chat ho?c seed h?i tho?i n?i b? theo phase resolver tr??c ??.
- Chat kh?ng hi?n n?t `??ng b? ??n h?ng`; ch? d?ng d? li?u OMS ?ang c? ho?c fallback ?? l?u.

### B??c ti?p theo

- D?n ti?p d? li?u h? th?ng Shopee `notification_type=join` v? placeholder debug c?n l?t v?o timeline chat.
- Sau ?? quay l?i nh?nh g?i th?t t? h?i tho?i seed m?i v? r? ti?p c?c case font/k? t? c?n s?t ? nh?ng block ch?a ??ng t?i.


## 2026-05-08 - Tách Shopee Video API riêng khỏi Shopee API chính

### Việc đã làm

- Thêm core Shopee Video auth riêng với các cột `video_*` trong `shops`: Partner ID/Key video, access/refresh token video, hạn token, `video_api_shop_id`, `video_api_user_id`, loại chủ thể và trạng thái test quyền.
- Thêm route auth riêng: `/api/auth/shopee/video/url` và `/channels/shopee/video/callback`; callback chỉ ghi vào cột `video_*`, không đụng token Shopee chính đang dùng cho đơn hàng/sản phẩm/ADS.
- Thêm route quản lý video app: `/api/shops/shopee-video-app-config`, `/api/shops/force-refresh-video-token`, `/api/shops/disconnect-video-api`, `/api/video/test-permission`.
- Chuyển toàn bộ route video sang Partner/Token video riêng; sync/upload/sửa/xóa bị khóa nếu chưa `Test quyền video` OK.
- Thêm khối `Shopee Video API` trong màn Kết nối API sàn và cập nhật `dashboard_video.html` để hiển thị rõ trạng thái: chưa cấu hình, cần kết nối, cần test quyền, sẵn sàng.
- Sửa CSS mobile của `dashboard_video` để viewport production 390px không bị kéo rộng bởi bảng/grid.

### Kiểm tra cú pháp

- `node --check apps/worker-api/src/core/shopee-video-auth-core.js` pass.
- `node --check apps/worker-api/src/core/marketplace-shop-capability-core.js` pass.
- `node --check apps/worker-api/src/routes/shops.js` pass.
- `node --check apps/worker-api/src/handlers/auth.js` pass.
- `node --check apps/worker-api/src/routes/video.js` pass.
- `node --check apps/worker-api/src/index.js` pass.
- `node --check apps/fe/js/admin/var-shops.js` pass.
- `node --check apps/fe/js/video-dashboard.js` pass.

### Deploy

- Worker production: `f8b24490-6db6-4e57-865f-e0b0c4a55b2c`.
- Frontend production: `fc11aa28-190d-4f0b-9c2c-3da1e29d38ce`.

### Kiểm production thật

- `GET /api/video/capabilities` production trả `video_sync_mode=api_missing_app`, `video_ready=0` cho `chihuy1984` khi chưa lưu Partner ID/Key video.
- `GET /api/auth/shopee/video/url?shop=chihuy1984` production trả HTTP `409` với `missing_shopee_video_app_config`, không redirect nhầm sang Shopee chính.
- `POST /api/shops/shopee-video-app-config` thiếu Partner Key video bị chặn HTTP `400`, tránh lưu mỗi Partner ID rồi báo nhầm là đã có app video.
- `POST /api/video/sync` cho `chihuy1984` khi chưa cấu hình video trả `ok_count=0`, `saved_library=0`, `saved_dashboard=0`, cảnh báo thiếu Partner ID/Key video; không gọi thao tác video thật lên Shopee.
- Mở production bằng Chrome profile `ProductionAdminTest` qua CDP:
  - `oms-dashboard?apiShop=chihuy1984&apiSection=video` tự mở modal, hiện khối `Shopee Video API`, trạng thái `Chưa cấu hình Video API`, đủ nút `Lưu cấu hình video`, `Kết nối/Gia hạn video`, `Test quyền video`, `Làm mới token video`, `Ngắt video`.
  - `dashboard_video` mobile 390px có `innerWidth=390`, `scrollWidth=390`, chọn `chihuy1984` hiện cảnh báo thiếu Partner ID/Key video và panel upload bị khóa.

### Trạng thái phase

- `Đã xong`: core/backend/UI tách Shopee Video API riêng, không ảnh hưởng Shopee API chính.
- `Đã xong`: dashboard video chỉ cho sync/upload/sửa/xóa khi `video_permission_status=ok`.
- `Đang chờ thao tác thật`: người vận hành nhập Live Partner Key video trong UI, bấm kết nối Shopee, đăng nhập/authorize thủ công, sau đó bấm `Test quyền video`.

### Shop có API

- Shopee chính `chihuy1984` vẫn giữ token đơn hàng/sản phẩm/ADS cũ.
- Shopee Video phải có Partner ID/Key video riêng, token video riêng và test quyền OK trước khi dashboard video chạy.

### Shop không có API

- Vẫn hiển thị luồng tham chiếu/kho video đóng gói.
- Không gắn nhãn đồng bộ API video khi chưa có app/token/test quyền video.

### Bước tiếp theo

- Trên UI production, nhập Live Partner ID/Key video cho `chihuy1984`, bấm `Lưu cấu hình video`, `Kết nối/Gia hạn video`, rồi `Test quyền video`.
- Sau khi test quyền OK, chạy sync video thật một lượt nhỏ và kiểm lại thư viện/dashboard video.


## 2026-05-08 - Chốt quyền Shopee Video live cho chihuy1984 và khóa UI đúng shop

### Việc đã làm

- Sửa guard Shopee Video auth: Video API là `User API`, nên backend không còn dùng `shop_id` như `video_api_user_id`.
- Callback `/channels/shopee/video/callback` chỉ lưu `video_api_user_id` khi Shopee trả `user_id/user_id_list`; nếu chỉ có shop token thì trạng thái báo rõ cần user_id video.
- Nút `Test quyền video` cập nhật lỗi dễ hiểu: token sai loại sẽ báo thiếu `user_id video`, không còn alert thô `Invalid access_token`.
- Modal `Kết nối API sàn` đã tách tab `API chính` và `Video API`, có banner `Đang thao tác: <shop>`, các nút chỉ áp dụng cho shop đang chọn.
- Lưu shop/section đang thao tác vào localStorage và URL `apiShop/apiSection`, sau save/test/refresh/disconnect không tự nhảy sang shop khác.
- `dashboard_video` lưu shop video đang chọn vào localStorage và URL `shop=...`, không tự nhảy sang shop khác khi đồng bộ/đọc cache.
- UI cập nhật trạng thái modal trước khi hiện alert, tránh cảnh nền phía sau còn `Cần test quyền video` trong khi alert đã báo OK.

### Kiểm tra cú pháp

- `node --check apps/worker-api/src/handlers/auth.js` pass.
- `node --check apps/worker-api/src/routes/video.js` pass.
- `node --check apps/worker-api/src/routes/shops.js` pass.
- `node --check apps/fe/js/video-dashboard.js` pass.
- Inline classic script trong `apps/fe/pages/oms-dashboard.html` đã kiểm bằng `new Function(...)` pass.

### Deploy

- Worker production: `f67a54df-e93e-484e-ac30-2c0ac7d90501`.
- Frontend production: `453c5f56-8e23-464c-a3a4-cecdb6c252cf`.

### Kiểm production thật

- `POST /api/video/test-permission` trước khi user reconnect đã trả lỗi rõ: token hiện tại là shop token, Shopee Video User API không nhận access_token này.
- Sau khi user bấm kết nối lại và test quyền trên production, `GET /api/shops/api-configs` cho `chihuy1984` trả `video_auth_subject_type=user`, có `video_api_user_id`, `video_permission_status=ok`.
- `GET /api/video/capabilities` cho `chihuy1984` trả `video_sync_mode=api_live`, `video_ready=1`.
- Gọi trực tiếp hàm UI `testShopeeVideoSelected()` trên production bằng Chrome profile `ProductionAdminTest`:
  - alert trả `Test quyền Shopee Video OK...`
  - select vẫn là `chihuy1984`
  - tab `Video API` vẫn mở, `API chính` ẩn
  - trạng thái nền đã là `Video đã test OK`
  - mobile 390px có `scrollWidth=390`
- `POST /api/video/sync` cho `chihuy1984`, `Last7d`, `end_date=2026-05-07` trả `ok_count=1`, `saved_library=60`, `saved_dashboard=1`.
- `GET /api/video/dashboard` cho `chihuy1984` trả `library_count=60`, `warnings_count=0`, `synced_at=2026-05-08 08:02:50`.
- Mở `dashboard_video.html?shop=chihuy1984` production:
  - select giữ đúng `chihuy1984`
  - status báo cache đã đồng bộ
  - danh sách thư viện hiển thị `60` video
  - mobile 390px không tràn ngang.

### Trạng thái phase

- `Đã xong`: Shopee Video API live cho `chihuy1984`, test quyền OK, đồng bộ đọc an toàn OK.
- `Đã xong`: UI kết nối không còn trộn API chính và Video API trong cùng một khối dài; shop đang thao tác được khóa rõ.
- `Đã xong`: dashboard video giữ đúng shop đang chọn khi đọc cache/đồng bộ.
- `Đang khóa an toàn`: upload/sửa/xóa video thật vẫn chỉ mở khi shop `video_ready=1`; nên vận hành theo rule duyệt/role trước khi dùng hàng loạt.

### Shop có API

- `chihuy1984` chạy Shopee Video bằng app/token video riêng, không đụng token Shopee API chính cho đơn hàng/sản phẩm/ADS.
- Đồng bộ video đọc từ Shopee Video API và lưu snapshot D1/cache để dashboard đọc lại.

### Shop không có API

- Vẫn đi luồng tham chiếu `Kho video đóng gói` hoặc dữ liệu đã lưu nội bộ.
- Không gắn nhãn đồng bộ API video nếu chưa có app/token/user_id/test quyền OK.

### Bước tiếp theo

- Nếu cần upload/sửa/xóa video thật hàng loạt, chốt rule duyệt: ai được bấm, preview payload, log kết quả, cách dừng/rollback khi Shopee trả lỗi.
- Mở rộng lịch đồng bộ video theo ngày hoặc theo shop khi cần tối ưu request.


## 2026-05-08 - Rút gọn UI mobile Shopee Video và chốt hướng auto upload

### Việc đã làm

- Kiểm UI production mobile 390px trước khi sửa:
  - `dashboard_video` không tràn ngang nhưng body dài hơn 52.000px, nhiều panel/nút lặp nên chưa đạt vận hành mobile-first.
  - Modal kết nối API giữ đúng shop nhưng phần Video API vẫn dồn nhiều thao tác trong một khối.
- Rút `dashboard_video` thành tab con:
  - `Tổng quan`
  - `Thư viện`
  - `Chi tiết`
  - `Upload`
  - `Tự động`
  - `Shop`
- Giữ panel chọn shop/đồng bộ ở đầu trang để tránh thao tác nhầm shop, còn các nhóm dài chỉ hiện theo tab đang chọn.
- Rút modal `Kết nối API sàn`:
  - Tóm tắt shop API đưa vào `details`, không mở mặc định.
  - Shopee Video API có tab con `Cấu hình` và `Kiểm tra`; các nút test/refresh/ngắt nằm riêng trong tab kiểm tra.
- Thêm tab `Tự động` trên trang video để ghi rõ hướng hàng đợi upload theo giờ; chưa bật chạy thật vì cần chốt rule duyệt.

### Kiểm tra

- `node --check apps/fe/js/video-dashboard.js` pass.
- Inline classic script trong `apps/fe/pages/oms-dashboard.html` pass.

### Deploy

- Frontend production: `3e2b6471-7901-49a3-9f66-9159a93744ec`.

### Kiểm production thật

- `dashboard_video.html?shop=chihuy1984&view=overview` mobile 390px:
  - `scrollWidth=390`
  - chỉ hiện các subview `overview`
  - body giảm còn khoảng `5918px`
- `dashboard_video.html?shop=chihuy1984&view=upload` mobile 390px:
  - `scrollWidth=390`
  - chỉ hiện subview `upload`
  - body khoảng `1435px`
- `dashboard_video.html?shop=chihuy1984&view=automation` mobile 390px:
  - `scrollWidth=390`
  - chỉ hiện subview `automation`
  - body khoảng `1402px`
- `oms-dashboard.html?apiShop=chihuy1984&apiSection=video` mobile 390px:
  - vẫn giữ đúng shop `chihuy1984`
  - tab `Kiểm tra` chỉ hiện `Test quyền video`, `Làm mới token video`, `Ngắt video`
  - `scrollWidth=390`

### Trạng thái upload / auto upload

- `Đã có`: upload thủ công qua `/api/video/upload` và UI tab `Upload`, chỉ mở cho shop đã `video_ready=1`.
- `Chưa bật`: upload tự động theo giờ.
- `Phương án nên làm`: tạo bảng hàng đợi/lịch trong D1, mỗi job có shop, file nguồn, caption, item_ids, giờ đăng, trạng thái duyệt, log từng bước; cron chạy theo lát cắt và chỉ đăng job đã bật.

### Bước tiếp theo

- Chốt phương án auto upload trước khi code sâu:
  1. Lịch đơn giản theo từng video/giờ.
  2. Hàng đợi nhiều video theo chiến dịch.
  3. Tự động lấy video từ thư mục/R2 rồi đăng theo khung giờ.


## 2026-05-08 - Hàng đợi upload Shopee Video theo giờ

### Việc đã làm

- Chốt phương án `Lịch đơn giản theo từng video/giờ`.
- Thêm core D1 `marketplace_video_upload_queue` trong `video_analytics_core`:
  - Mỗi job khóa theo `platform + shop`, có `queue_id`, file nguồn R2, caption, sản phẩm gắn kèm, giờ đăng, trạng thái, số lần chạy và lỗi cuối.
  - Trạng thái chính: `queued`, `processing`, `done`, `error`, `cancelled`.
- Thêm route backend:
  - `GET /api/video/upload-queue`
  - `POST /api/video/upload-queue`
  - `POST /api/video/upload-queue/cancel`
  - `POST /api/video/upload-queue/run`
- File video nguồn được lưu vào R2 dưới nhánh `video-upload-queue/...`; D1 chỉ lưu metadata và log.
- Cron Worker 5 phút chạy `runVideoUploadQueueBatch`, mỗi lát cắt tối đa `1` job đã đến giờ để tránh đăng hàng loạt khi có lỗi.
- Tab `Tự động` trên `dashboard_video` đã có:
  - form chọn file, giờ đăng, caption, thời lượng và sản phẩm gắn kèm,
  - preview bắt buộc trước khi tạo lịch,
  - checkbox xác nhận đúng shop/file/caption/giờ,
  - log lịch upload theo shop đang chọn,
  - nút hủy lịch,
  - nút kiểm tra job đến hạn ở chế độ dry-run, không đăng thật.

### Kiểm tra code

- `node --check apps/worker-api/src/core/video-analytics-core.js` pass.
- `node --check apps/worker-api/src/routes/video.js` pass.
- `node --check apps/worker-api/src/index.js` pass.
- `node --check apps/fe/js/video-dashboard.js` pass.

### Deploy

- Worker API production: `2739d3f1-d336-491d-a98a-568ca62e19c4`.
- Frontend production: `68212f0d-3a15-45bb-98ea-d234f91e5b48`.

### Kiểm production thật

- Mở `dashboard_video.html?shop=chihuy1984&view=automation` trên production, mobile 390px:
  - tab active: `Tự động`,
  - shop đang chọn: `chihuy1984`,
  - form `Tạo lịch upload`, preview và log queue hiển thị đúng,
  - `scrollWidth=390`, không tràn ngang.
- Bấm `Kiểm tra job đến hạn` ở chế độ dry-run:
  - trả `0 job đã đến hạn`,
  - không đăng thật lên Shopee.
- Tạo job test an toàn bằng file nhỏ `codex-queue-test.mp4`, đặt lịch xa tương lai `2030-01-01 08:00`, sau đó hủy ngay:
  - route tạo lịch trả thành công,
  - log hiện mã `queue_id`,
  - hủy lịch thành công và trạng thái chuyển `Đã hủy`,
  - không có lệnh upload/post thật lên Shopee vì job chưa đến hạn và đã bị hủy.
- Sau kiểm thử đã dọn đúng job test và action log test khỏi production D1; `GET /api/video/upload-queue?shop=chihuy1984` trả `rows=[]`, summary đều `0`.

### Trạng thái vận hành

- Shop có API: chỉ tạo/chạy lịch khi shop Shopee có Video API riêng, token còn hạn, có `video_api_user_id` và `Test quyền video` OK.
- Shop không API: không có nút đăng API; tiếp tục đi luồng tham chiếu `Kho video đóng gói`.
- Ghi thật lên Shopee: cron chỉ đăng khi job đến hạn. Kiểm thử an toàn dùng dry-run hoặc tạo/hủy job chưa đến hạn, không upload video thật nếu chưa có file test được duyệt.


## 2026-05-08 - Đổi giao diện quản lý video sang bảng vận hành

### Việc đã làm

- Đổi màn mặc định của `dashboard_video` sang tab `Video đã đăng`, không mở dashboard card/KPI trước.
- Thư viện video chuyển từ card lớn sang bảng giống Seller Center:
  - `Video`
  - `Thời gian đăng bài`
  - `Sản phẩm liên quan`
  - `Hiệu suất`
  - `Thao tác`
- Mỗi dòng có thumbnail nhỏ, thời lượng, caption, lượt xem/thích/bình luận, số sản phẩm liên quan, hiệu suất và thao tác.
- Thêm phân trang nhẹ ở frontend: mặc định hiện `20/60` video, bấm `Xem thêm 20 video` để mở tiếp.
- Nén giao diện mobile: không tràn ngang, mỗi dòng gọn hơn và không còn render 60 card lớn ngay khi mở.
- Sửa hiển thị thời gian video từ timestamp thô sang giờ/ngày Việt Nam.

### Kiểm tra code

- `node --check apps/fe/js/video-dashboard.js` pass.

### Deploy

- Frontend production: `d3dfb203-c130-4b7e-a18e-96342fbd0663`.

### Kiểm production thật

- Mở `dashboard_video.html?shop=chihuy1984` không truyền `view`:
  - tab active mặc định: `Video đã đăng`.
  - bảng có đủ 5 cột: `Video`, `Thời gian đăng bài`, `Sản phẩm liên quan`, `Hiệu suất`, `Thao tác`.
  - hiển thị `20/60` video, bấm `Xem thêm 20 video` tăng lên `40/60`.
- PC 1440px:
  - `scrollWidth=1425`, không tràn ngang.
  - body giảm còn khoảng `2988px` thay vì hơn `13.500px`.
- Mobile 390px:
  - `scrollWidth=390`, không tràn ngang.
  - body giảm còn khoảng `4307px` thay vì hơn `43.000px`.
- Bấm tab `Lịch upload` trên mobile vẫn mở đúng form tạo lịch, log queue hiện `Chưa có lịch upload video cho shop này.`


## 2026-05-08 - Rút gọn các tab Phân tích, Chi tiết, Upload và Lịch upload

### Việc đã làm

- Tab `Phân tích` chuyển top video/top sản phẩm sang bảng nhỏ giống `Video đã đăng`, không dùng card ảnh lớn.
- Thêm bộ `Lọc / sắp xếp theo` gồm `Doanh số`, `Đơn đặt`, `Lượt xem` và ô `Ngưỡng tối thiểu` để tìm nhanh video hoặc sản phẩm đang có tín hiệu bán.
- Nếu endpoint top video chưa có dữ liệu hiệu suất, bảng video tự fallback từ thư viện video đã đăng để vẫn lọc/sắp xếp được theo lượt xem.
- Tab `Chi tiết` đổi cụm chỉ số video sang bảng gọn; ảnh cover bị giới hạn nhỏ để không chiếm hết màn hình mobile.
- Tab `Upload` đổi form thành từng hàng nghiệp vụ: file, thời lượng, caption, gắn sản phẩm, kết quả tìm, sản phẩm sẽ gắn và thao tác đăng.
- Tab `Lịch upload` đổi phần quy trình, preview và log sang dạng bảng; log queue hiển thị theo cột `Lịch đăng`, `File / caption`, `Sản phẩm`, `Trạng thái`, `Thao tác` khi có job.

### Kiểm tra code

- `node --check apps/fe/js/video-dashboard.js` pass.

### Deploy

- Frontend production: `309af28f-478f-4af0-a2b3-a70daff4c3c9`.

### Kiểm production thật

- `dashboard_video.html?shop=chihuy1984&view=overview` desktop 1440px:
  - asset mới `video-ops-compact-tabs2-20260508` đã load.
  - chọn lọc `Lượt xem`, ngưỡng `1` trả `20` dòng video từ thư viện fallback.
  - `scrollWidth=1425`, `clientWidth=1425`, không tràn ngang.
  - không còn ảnh lớn trong tab phân tích (`largeImages=0`).
- `dashboard_video.html?shop=chihuy1984&view=overview` mobile 390px:
  - `scrollWidth=390`, không tràn ngang.
  - bảng video có `20` dòng, bảng sản phẩm có `8` dòng.
- `dashboard_video.html?shop=chihuy1984&view=detail` mobile 390px:
  - `scrollWidth=390`, có bảng chi tiết.
  - cover cao tối đa `92px`, không còn thumbnail lớn chiếm màn hình.
- `dashboard_video.html?shop=chihuy1984&view=upload` mobile 390px:
  - `scrollWidth=390`, form upload hiển thị dạng bảng gọn.
- `dashboard_video.html?shop=chihuy1984&view=automation` mobile 390px:
  - `scrollWidth=390`, form lịch upload và preview/log hiển thị dạng bảng.
  - queue hiện summary `Chờ: 0`, `Đang chạy: 0`, `Đã đăng: 0`, `Lỗi: 0`.

### Trạng thái vận hành

- Shop có API: `chihuy1984` tiếp tục dùng Shopee Video API riêng, mọi upload/sửa/xóa/lịch upload vẫn bị khóa bởi `video_ready=1` và quyền test video OK.
- Shop không API: không có upload API; vẫn dùng `Kho video đóng gói` hoặc dữ liệu tham chiếu tay, không gắn nhãn đồng bộ API.


## 2026-05-08 - Gộp đăng ngay và hẹn giờ vào một tab Đăng video

### Việc đã làm

- Bỏ tách riêng `Upload` và `Lịch upload`; UI chỉ còn một tab `Đăng video`.
- Trong tab `Đăng video`, thêm chọn chế độ:
  - `Hẹn giờ đăng`: lưu file vào R2, tạo job queue, có preview, checkbox xác nhận và log.
  - `Đăng ngay`: dùng cùng form file/caption/sản phẩm nhưng gửi lệnh upload thật ngay.
- URL cũ `view=automation` được tự chuyển về `view=upload` để không mở tab chết.
- Bảng `Video theo hiệu quả` không còn rỗng khi đang lọc doanh số/đơn nhưng Shopee chưa trả hiệu suất video; hệ thống fallback về thư viện video để vẫn hiện lượt xem và nút `Xem chi tiết`.
- Khối `Gắn video vào phân tích sản phẩm` đã sửa layout:
  - SKU dài không còn chồng chữ.
  - `SKU đang có video` có nút `Xem video`.
  - `Có view nhưng chưa ra đơn` fallback từ thư viện video và có nút `Xem chi tiết`.
  - Các khối trống ghi rõ là chưa có dữ liệu đủ tín hiệu trong snapshot.

### Kiểm tra code

- `node --check apps/fe/js/video-dashboard.js` pass.

### Deploy

- Frontend production: `7aa0b3a6-9ca0-44b4-b235-74fbd52e475d`.

### Kiểm production thật

- `dashboard_video.html?shop=chihuy1984&view=overview` desktop 1440px:
  - chỉ còn 5 tab con: `Video đã đăng`, `Phân tích`, `Chi tiết`, `Đăng video`, `Shop / API`.
  - không còn tab `Upload` và `Lịch upload`.
  - lọc `Doanh số >= 1` vẫn hiện `20` dòng video bằng fallback thư viện và có cảnh báo giải thích.
  - bảng sản phẩm có `8` dòng.
  - `scrollWidth=1425`, `clientWidth=1425`, không tràn ngang.
- Mobile 390px:
  - `scrollWidth=390`, không tràn ngang.
  - tab `Đăng video` có select `Hẹn giờ đăng` / `Đăng ngay`.
  - chọn `Đăng ngay` đổi nút thành `Đăng ngay`; chọn `Hẹn giờ đăng` đổi nút thành `Tạo lịch upload`.
  - URL cũ `view=automation` mở đúng tab `Đăng video`.
  - khối `Có view nhưng chưa ra đơn` có dòng video thật và nút `Xem chi tiết`.
  - không có ảnh lớn chiếm chỗ (`largeImages=0`).


## 2026-05-08 - Sửa KPI tổng và demographics tab Phân tích video

### Việc đã làm

- `video_analytics_core` không còn chỉ đọc `overview_json` của Shopee. Nếu `overview_json` rỗng nhưng `trend_json` có dữ liệu, core tự cộng KPI tổng từ trend theo ngày.
- KPI tổng hiện được các chỉ số chính: doanh thu đặt, đơn đặt, lượt xem, lượt thích, bình luận, người xem hiệu quả, CTR và người theo dõi mới.
- Trường người theo dõi mới được chặn không cộng số âm từ trend theo ngày để không làm KPI tổng khó hiểu.
- `Audience / demographics` không còn dựng 4 ô trống. Nếu endpoint demographics không có tuổi, giới tính, khu vực hoặc nhóm mua sắm, UI hiển thị một cảnh báo gọn và ghi rõ đang ưu tiên Trend/Sản phẩm bán được.
- Panel `Cảnh báo đồng bộ video` chỉ hiện khi có nội dung cảnh báo thật, không còn chiếm chỗ khi danh sách rỗng.
- Tăng version asset `video-analysis-fallback-20260508c` để trình duyệt lấy đúng JS/CSS mới.

### Kiểm tra code

- `node --check apps/worker-api/src/core/video-analytics-core.js` pass.
- `node --check apps/fe/js/video-dashboard.js` pass.

### Deploy

- Worker API production: `ea19f655-1e1c-4377-a621-d01ca4fc812f`.
- Frontend production: `010b98aa-2ae3-4b3d-be4a-74b72a7e0b9a`.

### Kiểm production thật

- API thật `GET /api/video/dashboard?platform=shopee&shop=chihuy1984&period_type=Last30d&end_date=2026-05-07`:
  - `overview_source=trend_fallback`.
  - doanh thu đặt `6.281.888đ`, đơn đặt `48`, lượt xem `3.746`, người xem hiệu quả `1.342`, CTR `7.97%`.
- Chrome production profile mở `dashboard_video.html?shop=chihuy1984&view=overview`, chọn `Last30d`, ngày chốt `2026-05-07` và bấm `Đọc cache hiện có`:
  - chỉ còn 5 tab con: `Video đã đăng`, `Phân tích`, `Chi tiết`, `Đăng video`, `Shop / API`.
  - không còn tab cũ `Upload` và `Lịch upload`.
  - KPI tổng hiện số thật từ trend fallback.
  - `Audience / demographics` hiện cảnh báo gọn: Shopee chưa trả dữ liệu người xem.
  - panel cảnh báo đồng bộ rỗng đã ẩn (`display=none`, `warningItems=0`).
  - trend có `29` dòng, sản phẩm bán được có `12` dòng, video theo hiệu quả có `20` dòng.
- Mobile 390px:
  - `scrollWidth=390`, không tràn ngang.
  - tab active `Phân tích`, KPI tổng và cảnh báo demographics hiển thị gọn.

### Trạng thái vận hành

- Shop có API: `chihuy1984` dùng Shopee Video API riêng; dashboard đọc snapshot đã lưu, nếu overview Shopee rỗng thì core tự tổng hợp từ trend để không mất số liệu tổng.
- Shop không API: vẫn không gắn nhãn đồng bộ API; dùng `Kho video đóng gói` hoặc dữ liệu tham chiếu tay.


## 2026-05-08 - Gọn bảng video, AI tiêu đề và kiểm thời lượng file trước upload

### Việc đã làm

- Bảng `Video theo hiệu quả` đã giới hạn tiêu đề hiển thị tối đa 92 ký tự và 2 dòng; tiêu đề đầy đủ vẫn nằm ở tooltip để không mất nội dung.
- Nhãn `Tín hiệu` đổi về pill nhỏ, không còn phình thành hình tròn lớn làm đội chiều cao dòng.
- Form `Đăng video` thêm bộ đếm tiêu đề `0/118 ký tự`, giữ cùng màn `Đăng ngay / Hẹn giờ`.
- Thêm route production `POST /api/video/title-suggestions` để gọi Gemini viết gợi ý tiêu đề video; backend có fallback nội bộ nếu Gemini lỗi.
- Core AI khóa theo cụm sản phẩm chính trong caption/sản phẩm gắn kèm, loại các gợi ý đổi sai loại sản phẩm và lọc cụm rủi ro như hotline, Zalo, cam kết tuyệt đối.
- Form đọc metadata từ file video đã chọn, tự điền thời lượng thật và chặn gửi nếu ngoài giới hạn Shopee Video đang áp dụng `1-180 giây`.

### Kiểm tra code

- `node --check apps/fe/js/video-dashboard.js` pass.
- `node --check apps/worker-api/src/routes/video.js` pass.

### Deploy

- Worker API production: `93e7f279-293d-4fce-b6c9-7e551ec73aca`.
- Frontend production: `cdca3b61-83c2-4003-82f7-8feaca3622f8`.

### Kiểm production thật

- Chrome production profile mở `dashboard_video.html?shop=chihuy1984&view=overview`:
  - asset JS mới `video-upload-ai-duration-20260508a` đã load.
  - bảng `Video theo hiệu quả` có `20` dòng, không tràn ngang desktop.
  - pill tín hiệu còn khoảng `104x36px`, dòng bảng khoảng `87px`, không còn hình tròn lớn.
- Chrome production profile mở `dashboard_video.html?shop=chihuy1984&view=upload`:
  - field tiêu đề có `maxlength=118` và meter `0/118 ký tự`.
  - field thời lượng có `min=1`, `max=180`, ghi rõ giới hạn `1-180 giây`.
  - bấm `Gợi ý AI` với caption `Giăng bồn cầu chống mùi...` trả 5 gợi ý giữ đúng cụm `Giăng bồn cầu`, không đổi sang nắp/bệ/ghế bồn cầu.
  - chọn file thật tải từ thư viện Shopee `sample-shopee-video.mp4`, UI đọc metadata `39 giây` và báo `File hợp lệ`.
- Mobile 390px:
  - `scrollWidth=390`, không tràn ngang.
  - form upload, tiêu đề AI và preview nằm gọn trong viewport.

### Trạng thái vận hành

- Shop có API: `chihuy1984` dùng Shopee Video API riêng; AI chỉ hỗ trợ viết tiêu đề và không tự gửi lệnh lên Shopee. Upload thật vẫn phải qua preview, kiểm thời lượng và quyền video OK.
- Shop không API: không có upload API; vẫn chỉ dùng kho video đóng gói hoặc tham chiếu tay, không gắn nhãn đồng bộ API.


## 2026-05-08 - Hashtag tiêu đề và cảnh báo video đã đăng trùng

### Việc đã làm

- AI tiêu đề video bắt buộc gắn `#shophuyvan` và thêm một hashtag sản phẩm ngắn nếu còn ký tự.
- Backend bỏ hashtag AI tự bịa/lặp rồi tự gắn lại bộ hashtag chuẩn để tránh thiếu `#shophuyvan` hoặc hashtag bị cắt sai.
- Form `Đăng video` có ghi chú hashtag bắt buộc; nếu người vận hành tự nhập thiếu `#shophuyvan`, hệ thống tự thêm trước khi gửi lệnh.
- Thêm khối `So sánh video đã đăng` ngay trong form đăng:
  - so theo tiêu đề, hashtag và sản phẩm gắn kèm,
  - hiện video giống nhất, lượt xem/lượt thích và nút `Xem`,
  - nhãn `Không nên đăng lại` khi điểm giống cao.
- Nếu video giống từ `70%` trở lên, upload bị chặn cho tới khi người vận hành tick xác nhận đã kiểm tra video giống và vẫn muốn đăng lại.

### Kiểm tra code

- `node --check apps/fe/js/video-dashboard.js` pass.
- `node --check apps/worker-api/src/routes/video.js` pass.

### Deploy

- Worker API production: `4f0de923-0420-44fb-8308-dcd9b73f6282`.
- Frontend production: `c165755a-91bc-4581-9386-abeda1273cc4`.

### Kiểm production thật

- API thật `POST /api/video/title-suggestions` với sản phẩm `Combo 5 Chốt Cửa Inox` trả `5` gợi ý, tất cả có `#shophuyvan`, dài tối đa `87/118` ký tự.
- Chrome production mở `dashboard_video.html?shop=chihuy1984&view=upload`:
  - asset mới `video-hashtag-duplicate-20260508a` đã load.
  - bấm `Gợi ý AI` trên form trả tiêu đề có `#shophuyvan`.
  - nhập tiêu đề trùng `Bam vao gio hang de mua #shophuyvan`, khối so sánh báo `Không nên đăng lại`, video gần nhất giống `78%`, hiện checkbox xác nhận đăng lại.
- Mobile 390px:
  - `scrollWidth=390`, không tràn ngang.

### Trạng thái vận hành

- Shop có API: `chihuy1984` vẫn upload qua Shopee Video API riêng; cảnh báo trùng là guard trước khi gửi lệnh thật.
- Shop không API: không upload API; có thể dùng cùng logic so sánh nếu sau này nhập tham chiếu tay vào thư viện video core.
## 2026-05-08 - AI sửa tiêu đề video và lỗi lưu video rõ nguyên nhân

### Việc đã làm

- Tab `Chi tiết` thêm nút `Gợi ý AI` ngay trong khối `Sửa / xóa video`, dùng chung core `POST /api/video/title-suggestions` với form đăng video.
- Ô tiêu đề khi sửa có `maxlength=118`, meter ký tự và ghi chú hashtag bắt buộc `#shophuyvan`; khi bấm `Lưu thông tin video`, frontend tự bổ sung hashtag nếu còn thiếu.
- Backend `edit_video_info` cũng chuẩn hóa hashtag bắt buộc để lệnh từ UI cũ/helper không làm mất dấu tìm kiếm của shop.
- Route `POST /api/video/edit` đã bọc lỗi và trả JSON/CORS về UI; lỗi thiếu dữ liệu hoặc Shopee trả lỗi không còn rơi về alert chung `Failed to fetch`.
- Core AI bỏ các từ bị cắt cụt ở cuối tiêu đề trước hashtag, ví dụ không còn trả dạng `Đa #shophuyvan` hoặc `vệ #shophuyvan`.

### Kiểm tra code

- `node --check apps/fe/js/video-dashboard.js` pass.
- `node --check apps/worker-api/src/routes/video.js` pass.

### Deploy

- Worker API production: `14f3d82a-ffdb-4764-8213-6f7bbb30da31`.
- Frontend production: `2d5b3b02-1f6d-450d-8019-8cb59d7a8f7f`.

### Kiểm production thật

- Chrome production profile qua cổng debug `9333` mở `dashboard_video?shop=chihuy1984&view=detail&v=video-edit-ai-20260508a`.
- Asset production đã load đúng `video-dashboard.js?v=video-edit-ai-20260508a`.
- Form sửa video có 1 nút `Gợi ý AI`, ô `videoEditCaption` có `maxlength=118`, meter ban đầu `26/118 ký tự`.
- Bấm `Gợi ý AI` trả 4 gợi ý từ Gemini; tất cả có `#shophuyvan`, dài `83-87/118` ký tự và không còn từ cụt trước hashtag.
- Bấm `Dùng` đưa tiêu đề vào ô sửa, meter cập nhật `83/118 ký tự`, ghi chú báo đã có `#shophuyvan`. Chưa bấm `Lưu thông tin video` để tránh sửa video thật khi chỉ kiểm AI.
- Test lỗi an toàn bằng payload thiếu cover cho `/api/video/edit` trả JSON đọc được: HTTP `400`, `status=error`, message `Không sửa được video: Thiếu ảnh cover...`; không còn lỗi mạng `Failed to fetch`.

### Trạng thái vận hành

- Shop có API: `chihuy1984` có thể dùng AI để viết lại tiêu đề trước, sau đó người vận hành tự bấm `Lưu thông tin video` mới gửi lệnh thật lên Shopee.
- Shop không API: không có quyền sửa video qua API; chỉ dùng kho video/ghi chú tham chiếu, không hiển thị là đồng bộ API thật.

## 2026-05-08 - Luồng đăng video đa shop

### Việc đã làm

- Thêm tab `Đa shop` trong `dashboard_video.html` để tạo chiến dịch video riêng, không trộn vào tab đăng một shop.
- Backend thêm `POST /api/video/multi-shop/preview` và `POST /api/video/multi-shop/queue`.
- Mỗi chiến dịch dùng `campaign_video_key`; file video gốc chỉ lưu R2 một lần theo `video-upload-campaign/...`, còn mỗi shop tạo một dòng `marketplace_video_upload_queue` riêng.
- Mỗi shop có cấu hình riêng: bật/tắt shop, tiêu đề, hashtag, sản phẩm gắn kèm, giờ đăng, cho phép đăng lại video gần giống.
- Preview guard trước khi tạo lịch kiểm: Shopee Video API đã test OK, thời lượng video, tiêu đề có `#shophuyvan`, sản phẩm tồn tại trong catalog shop đó, video gần giống đã đăng và job cùng campaign đang chờ.
- Hủy một job trong chiến dịch đa shop không xóa nhầm file R2 nếu còn job khác cùng dùng chung file gốc.

### Kiểm tra code

- `node --check apps/worker-api/src/routes/video.js` pass.
- `node --check apps/fe/js/video-dashboard.js` pass.

### Deploy

- Worker API production: `41663653-f466-4039-844f-6db72e727868`.
- Frontend production: `73af6430-b65d-450f-8baa-41c4d1b687d5`.

### Kiểm production thật

- `/api/video/capabilities` production trả `chihuy1984` là shop Shopee duy nhất đang `video_sync_mode=api_live`, `video_ready=1`; các shop Shopee còn lại đang `api_missing_app`.
- `POST /api/video/multi-shop/preview` với `chihuy1984 + chihuy2309` trả `summary.total=2`, `ready=1`, `missing_api=1`; `chihuy1984` đủ điều kiện queue, `chihuy2309` bị khóa vì thiếu app Shopee Video.
- Preview cũng phát hiện video gần giống `93%` cho sản phẩm `15477291455`; khi bật xác nhận đăng lại thì trạng thái chuyển về `Chờ đăng`.
- Chrome production profile qua CDP `127.0.0.1:9333` mở `dashboard_video?shop=chihuy1984&view=multi&v=video-multi-shop-20260508a`: asset mới đã load, tab `Đa shop` hiển thị đủ 4 shop Shopee, row `chihuy1984` có guard riêng.
- Mobile 390px: `scrollWidth=390`, không tràn ngang; layout đa shop hiển thị dạng card theo từng shop.
- Đã tạo thử 1 job lịch xa tương lai bằng API thật và file thật `sample-shopee-video.mp4`: R2 key dùng dạng `video-upload-campaign/20260508/{campaign_video_key}/sample-shopee-video.mp4`, status ban đầu `queued`.
- Đã bấm nút thật `Tạo lịch cho shop đủ điều kiện` trên tab `Đa shop`; frontend tạo được job queue cho `chihuy1984`, sau đó hủy ngay để không đăng video thật lên Shopee.
- Dữ liệu test production đã dọn khỏi `marketplace_video_upload_queue` và `marketplace_video_action_logs`; kiểm lại D1 còn `0` queue/log test theo các `campaign_video_key` của Codex, R2 test key cũng không còn tồn tại.

### Trạng thái vận hành

- Shop có API: `chihuy1984` có thể dùng tab `Đa shop` để tạo campaign, preview guard trước, rồi tạo lịch upload theo từng shop/job.
- Shop không API: vẫn hiện trong bảng nhưng bị khóa `Thiếu API video`; không tạo job upload API và không gắn nhãn đồng bộ thật.
- Lazada/TikTok: chưa có adapter upload video trong phase này; chỉ giữ ở kho video/tham chiếu, không ảnh hưởng luồng Shopee Video API.

## 2026-05-08 - Dọn cấu trúc Python local vào `oms_python`

### Việc đã làm

- Gom Python local vào `auto OMS Python/oms_python`.
- Xóa thật các thư mục Python cũ ở root `auto OMS Python`: `engines`, `parsers`, `ui`.
- Chuyển helper local sang `auto OMS Python/oms_python/features/local_helper/server.py`.
- Chuyển chat automation sang `auto OMS Python/oms_python/features/chat/automation_browser.py`.
- Chuyển runtime Chrome sang `auto OMS Python/oms_python/core/browser_runtime/settings.py`.
- Chuyển script nhập/xuất mua hàng chính ngạch từ root repo sang `auto OMS Python/oms_python/features/purchase`.
- Không gom tool riêng `switch github` vào OMS Python; `switch_env.py` và `profiles.json` đã được trả về đúng thư mục riêng `switch github`.
- Chuyển các Chrome profile automation `HuyVan_Bot_Data*` khỏi Desktop vào `auto OMS Python/profiles/browser` và cập nhật `auto OMS Python/data/shops.json`.
- Cập nhật script TikTok dry-run/read-only để default profile dùng `auto OMS Python/profiles/browser/HuyVan_Bot_Data_TikTok`, không sinh lại folder ngoài Desktop.
- Chuyển các file Desktop cũ liên quan HuyVan/auto/upload/dashboard và automation phụ vào `auto OMS Python/desktop_archive/2026-05-08-desktop-cleanup`; có `MANIFEST.json` để tra lại file gốc.
- Xóa cache Python còn sót trong `scripts/__pycache__` và xóa file cây thư mục cũ `project_tree_full.txt` vì đã lệch cấu trúc thật.
- Chia lại code theo sàn và tính năng:
  - Shopee: `auth`, `orders`, `products`, `finance`, `promotion`, `video`, `chat`.
  - Lazada: `auth`, `orders`, `products`, `finance`, `chat`.
  - TikTok: `auth`, `orders`, `products`, `finance`, `chat`.
- Cập nhật `AGENTS.md` và `auto OMS Python/docs/cau-truc-python.md` để các lần sau không tạo Python rải rác.

### Kiểm tra thực tế

- `python -m py_compile` pass toàn bộ Python dưới `auto OMS Python`.
- Import thực tế pass cho core, utils, engine Shopee/Lazada/TikTok, chat automation, local helper, report download và UI main window.
- Đã dừng process helper cũ chạy từ `scripts/oms-radar-local-helper.py`.
- Đã khởi động helper mới từ `auto OMS Python/oms_python/features/local_helper/server.py`.
- `GET http://127.0.0.1:8765/health` trả `ok=true`, `helper_port=8765`.
- `POST /chat-warm` với `platform=lazada` trả đúng guard `lazada_automation_removed`, xác nhận helper mới đang xử lý request thật.
- `scripts` không còn file `.py` hoặc `__pycache__`; root repo không còn `import_purchase.py`, `super_export_purchase.py`.
- Tool riêng `switch github` vẫn nằm ngoài cấu trúc OMS và không được tính là source Python vận hành OMS.
- Desktop không còn các thư mục Chrome profile `HuyVan_Bot_Data*`; profile đang nằm trong `auto OMS Python/profiles/browser`.
- Desktop không còn các file/folder cũ đã archive như `huyvan_auto*`, `file up sản phẩm`, `video tự động`, `mass_update*`, `phantich*`, `shop_data.db`, `auto_click_yes.py`, `install_n8n_huy.py`.

### Trạng thái vận hành

- `scripts` hiện chỉ còn script kiểm thử CDP, PowerShell và công cụ không phải Python.
- Root `auto OMS Python` chỉ giữ launcher mỏng `main.py`, dữ liệu/profile, log/tệp vận hành và package `oms_python`.
- Tính năng video repost/shop chưa API sẽ đặt tiếp vào `oms_python/features/video_repost` và `oms_python/platforms/shopee/video`, không tạo file Python rải rác.

## 2026-05-08 - Sửa lỗi lưu thông tin video không còn `Failed to fetch`

### Việc đã làm

- Sửa backend `syncShopeeVideoDetail`: Shopee Video detail chỉ nhận một khóa tra cứu, nên route không còn gửi đồng thời `video_upload_id` và `post_id` vào `/api/v2/video/get_video_detail`.
- Bọc route `GET /api/video/detail` bằng JSON/CORS để nếu Shopee hoặc D1 lỗi thì UI vẫn thấy nguyên nhân cụ thể, không rơi về lỗi mơ hồ `Failed to fetch`.
- Sửa frontend `submitEditVideo`: sau khi `/api/video/edit` thành công, UI vá lại state hiện tại và không gọi refresh detail phụ để lỗi phụ ghi đè trạng thái lưu thành công.
- Thêm core `patchMarketplaceVideoEditedCache` để cache `marketplace_video_library`, link sản phẩm và detail snapshot giữ đúng payload đã được Shopee nhận; mục đích là reload dashboard/detail không quay lại tiêu đề cũ khi Shopee detail còn trả dữ liệu stale trong vài giây đầu.

### Kiểm tra code

- `node --check apps/worker-api/src/core/video-analytics-core.js` pass.
- `node --check apps/worker-api/src/routes/video.js` pass.
- `node --check apps/fe/js/video-dashboard.js` pass.

### Deploy

- Worker API production cuối: `55a960d1-c886-4eb5-ad05-97abcf4c9238`.
- Frontend production đang dùng: `c5835873-3189-4cf3-bd7f-d628f1177959`.

### Kiểm production thật

- Gọi trực tiếp `/api/video/detail?platform=shopee&shop=chihuy1984&video_upload_id=vn-11110122-6khw0-m93xy5iu3xqfe4&post_id=WsRXe84-CQBFtiIKAAAAAA%3D%3D&refresh=1` trả HTTP `200`, `content-type=application/json`, CORS `*`; không còn Worker `1101` và không còn lỗi `video_upload_id and post_id can only select one`.
- Chrome production profile qua CDP `127.0.0.1:9333` mở `dashboard_video?shop=chihuy1984&view=detail&v=video-edit-save-20260508a`; asset load đúng `video-dashboard.js?v=video-edit-save-20260508a`.
- Bấm thật `Lưu thông tin video` cho video `vn-11110122-6khw0-m93xy5iu3xqfe4`: `/api/video/edit` trả HTTP `200`, `success_list` có video này, UI hiện `Đã gửi lệnh sửa thông tin video lên Shopee`, body không còn `Failed to fetch` hoặc `Không gọi được API video`.
- Sau lưu, network chỉ còn request `/api/video/edit`; không còn gọi refresh detail phụ từ nút lưu.
- Cache dashboard và detail sau reload đều giữ tiêu đề `Bấm vào giỏ hàng để mua 👆 #shophuyvan #banchailongmem`.
- Mobile 390px: không tràn ngang, nút `Lưu thông tin video` kéo tới được và vẫn bấm được.

### Trạng thái vận hành

- Shop có API: `chihuy1984` đã lưu/sửa video qua Shopee Video API riêng, có log backend và cache core giữ đúng tiêu đề sau khi lưu.
- Shop không API: vẫn khóa thao tác sửa video API; chỉ dùng kho video/tham chiếu tay, không gắn nhãn đồng bộ API thật.
- Lazada/TikTok: chưa có adapter sửa video trong phase này; không bị ảnh hưởng bởi sửa lỗi Shopee Video.

## 2026-05-08 - Lazada Media Center video và endpoint trong hình

### Việc đã làm

- Worker Video thêm Lazada Media Center: `GET /api/video/lazada/quota`, `GET /api/video/lazada/detail`, `POST /api/video/lazada/image-upload`, `POST /api/video/lazada/upload`, `POST /api/video/lazada/remove`.
- Lazada upload video chạy đúng flow tài liệu: `/media/video/block/create` -> `/media/video/block/upload` -> `/media/video/block/commit`, lưu kết quả vào `marketplace_video_library` và `marketplace_video_detail_snapshots`.
- Upload ảnh cover Lazada dùng `/image/upload`; xóa video Lazada yêu cầu `confirm_remove = XOA_VIDEO_LAZADA` để tránh xóa thật nhầm.
- Capability matrix đổi Lazada có API sang `video_sync_mode=lazada_media_api`, `supports_video_library_api=true`, `supports_video_write_api=true`, `supports_video_analytics_api=false`.
- UI `dashboard_video.html` thêm tab `Lazada video`: chọn shop, đọc quota, upload cover, upload video, tra video_id; ghi rõ Lazada chưa có analytics/list đồng cấp Shopee.
- Advanced API center thêm feature/module `Lazada Media Center video` và permission matrix Media Center API.
- Checklist cập nhật thêm nhóm endpoint Shopee Media/MediaSpace và Shopee Shop trong hình; các endpoint ghi hồ sơ/holiday mode vẫn để trạng thái cần guard riêng.

### Kiểm tra code

- `node --check apps/worker-api/src/routes/video.js` pass.
- `node --check apps/worker-api/src/routes/api-sync.js` pass.
- `node --check apps/worker-api/src/routes/api-features.js` pass.
- `node --check apps/worker-api/src/routes/api-modules.js` pass.
- `node --check apps/worker-api/src/core/marketplace-shop-capability-core.js` pass.
- `node --check apps/fe/js/video-dashboard.js` pass.
- `git diff --check` cho cụm file video/API/docs pass, chỉ còn cảnh báo CRLF của `dashboard_video.html`.

### Deploy

- Worker API production: `7200f7de-4e44-4149-891f-a4ec85b562df`.
- Frontend production: `42c7a483-9e29-41d8-b21b-3e3082250861`.

### Kiểm production thật

- `/api/video/capabilities` production trả `6` shop; Lazada `kinhdoanhonlinegiasoc@gmail.com` có `video_sync_mode=lazada_media_api`, `video_ready=1`, `supports_video_library_api=true`, `supports_video_write_api=true`, `supports_video_analytics_api=false`.
- `GET /api/video/lazada/quota?shop=kinhdoanhonlinegiasoc%40gmail.com` trả `status=ok`, `capacity_size=42949672960`, `used_size=3574683625`, `remaining_size=39374989335`, request id Lazada `21541e4017782454413085923`.
- `POST /api/video/lazada/remove` không có chuỗi xác nhận trả lỗi tiếng Việt `Lệnh xóa Lazada là thao tác thật... confirm_remove = XOA_VIDEO_LAZADA`.
- Production `dashboard_video.html?view=lazada` tải đúng asset `video-dashboard.js?v=video-lazada-media-20260508a`.
- Chrome CDP mở trang live, bấm thật tab `Lazada video` và nút `Đọc quota`: panel hiện shop Lazada, quota còn lại `37550.9 MB`, đã dùng `3409.1 MB`, tổng `40960.0 MB`, trạng thái `Đã đọc quota Lazada Media Center.`
- Mobile 390px: `bodyWidth=390`, không tràn ngang; tab Lazada vẫn hiển thị đúng shop và ghi chú Media Center.
- Profile kiểm đang là reviewer nên auth-guard khóa nút upload thật bằng `disabled`, đúng chính sách chỉ đọc; chưa upload video thật để tránh tạo media ngoài yêu cầu kiểm thử.

### Trạng thái vận hành

- Shop Lazada có API: dùng API chính thức để đọc quota, upload cover, upload video theo block và tra trạng thái `video_id`; dữ liệu media lưu vào core video chung.
- Shop Lazada không có API: vẫn là tham chiếu tay/Seller Center, không gắn nhãn upload API.
- Shopee: nhóm endpoint Media/MediaSpace trong hình đã được ghi nhận vào checklist; flow Shopee Video hiện vẫn dùng app/token Video riêng và guard quyền như trước.
- Shopee Shop: endpoint profile/warehouse/notification/brand/holiday mode trong hình đã ghi vào phase shop, nhưng `update_profile` và `set_shop_holiday_mode` chưa bật vì cần preview/log/xác nhận riêng.
- Lazada analytics/list video: chưa có endpoint tương đương Shopee trong bộ tài liệu đã rà, nên dashboard hiệu quả Lazada chưa tính view/đơn/doanh số từ video.

## 2026-05-08 - Đa shop thêm luồng đăng tay cho shop chưa API

### Việc đã làm

- Backend `POST /api/video/multi-shop/preview` phân biệt rõ shop API và shop chưa API: shop đủ quyền video trả `ready`, shop thiếu Video API nhưng đủ tiêu đề/sản phẩm/guard trả `manual_upload`.
- Backend `POST /api/video/multi-shop/queue` vẫn tạo queue cho shop có API, nhưng với shop chưa API chỉ lưu action log `manual_upload_multi_shop_campaign`, kèm `campaign_video_key`, caption, item, giờ đăng và link Creator Center; không giả lập là đã đồng bộ API.
- UI tab `Đa shop` thêm tổng quan `Đăng tay`, nút `Copy nội dung đăng`, link `Mở Creator Center`, và nút chính đổi thành `Tạo lịch API / lưu log đăng tay`.
- HTML đổi cache bust sang `video-multishop-manual-20260508b` để trình duyệt đang mở không giữ JS/CSS cũ.

### Kiểm tra code

- `node --check apps/fe/js/video-dashboard.js` pass.
- `node --check apps/worker-api/src/routes/video.js` pass.
- `git diff --check` cho các file video/checklist pass, chỉ có cảnh báo CRLF của file HTML.

### Deploy

- Worker API production: `98e35eb0-083e-4a20-ba97-7e993ab39ab3`.
- Frontend production lần cuối: `ff413462-bd34-4199-8fdc-b142ecfaaf34`.

### Kiểm production thật

- `/api/video/capabilities` production trả `6` shop, trong đó Shopee `chihuy1984` đang `video_ready=1`, các shop Shopee còn lại chưa có Video API riêng.
- `POST /api/video/multi-shop/preview` production với `chihuy1984 + chihuy2309` trả `summary.total=2`, `ready=1`, `manual_upload=1`, `missing_api=1`.
- Row `chihuy1984` trả `status_code=ready`, `can_queue=1`.
- Row `chihuy2309` trả `status_code=manual_upload`, `manual_required=1`, `manual_upload_url=https://banhang.shopee.vn/creator-center/video-upload/upload`.
- Frontend production `dashboard_video.html` đã trả đúng asset version `video-multishop-manual-20260508b`; CSS production có class `.video-manual-actions`.
- Chrome production qua CDP mở tab `dashboard_video.html?view=multi&shop=chihuy1984`, thao tác UI thật bằng nút `Kiểm tra chiến dịch`: status hiển thị `1 shop tạo lịch API, 1 shop đăng tay`; row `chihuy2309` có khối đăng tay, row `chihuy1984` không có khối đăng tay, các shop chưa chọn `khogiadungcona/phambich2312` không còn hiện khối đăng tay.
- Kiểm manual-only bằng `POST /api/video/multi-shop/queue` production với riêng `chihuy2309`: route trả `status=ok`, `rows=[]`, `manual_rows=1`, message báo `0 job API` và `1 shop chưa API đã lưu log đăng tay`; không gọi upload Shopee vì không có shop API trong payload.
- Dọn dữ liệu test manual-only: xóa R2 key `video-upload-campaign/20260508/vcmp_codex_manual_only_20260508a/codex-manual-only.mp4`, xóa `2` action log test, kiểm lại D1 còn `log_count=0`, `queue_count=0`, R2 trả `key does not exist`.

### Trạng thái vận hành

- Shop có API: `chihuy1984` đi queue API như cũ, vẫn có guard token/quyền, tiêu đề, sản phẩm, thời lượng và video trùng.
- Shop không API: hiển thị trong tab `Đa shop` dưới dạng `Đăng tay qua Seller Center`; người vận hành copy nội dung, mở Creator Center và upload tay đúng shop, còn OMS lưu log chiến dịch.
- Lazada/TikTok: chưa có adapter đăng video đa sàn trong phase này; vẫn giữ ở luồng tham chiếu/kho video, không bị gắn nhãn Shopee Video API.

## 2026-05-08 - Sửa lỗi Shopee Video `cover 0 is illegal`

### Việc đã làm

- Backend `POST /api/video/edit` không còn tin trực tiếp `cover_image_url` từ UI nếu giá trị là rác như `0`, số thuần, `null` hoặc không phải URL ảnh hợp lệ.
- Khi người vận hành chỉ sửa tiêu đề/sản phẩm, backend tự lấy cover hợp lệ theo thứ tự: payload hợp lệ, cache chi tiết, thư viện video, rồi Shopee `get_cover_list`; sau đó mới gọi API sửa video.
- Frontend tab `Chi tiết` lọc cover không hợp lệ trước khi hiển thị/chọn/lưu; nếu không có cover hợp lệ từ UI thì gửi rỗng để backend fallback, không gửi `0`.
- HTML đổi cache bust sang `video-cover-fallback-20260508a`.

### Kiểm tra code

- `node --check apps/worker-api/src/routes/video.js` pass.
- `node --check apps/fe/js/video-dashboard.js` pass.
- `git diff --check` cho cụm video pass, chỉ còn cảnh báo CRLF của `dashboard_video.html`.

### Deploy

- Worker API production: `718c50b6-0470-4d79-be88-38738facc751`.
- Frontend production: `188becb8-b1c0-4065-99d7-c976cb788e32`.

### Kiểm production thật

- `dashboard_video.html` production trả đúng asset `video-dashboard.js?v=video-cover-fallback-20260508a`.
- Refresh detail thật cho video `vn-11110122-6v8go-mfygtcatbqj170` trả HTTP `200` và có `19` cover hợp lệ từ Shopee.
- Gọi lại đúng case lỗi với payload `cover_image_url: "0"` cho video trên: `/api/video/edit` trả HTTP `200`, `success_list` có `vn-11110122-6v8go-mfygtcatbqj170`, không còn lỗi `cover 0 is illegal`.
- Chrome production qua CDP mở tab `dashboard_video.html?view=detail&shop=chihuy1984`, bấm thật `Lưu thông tin video`: UI hiện `Đã gửi lệnh sửa thông tin video lên Shopee`, network `/api/video/edit` HTTP `200`, body gửi lên có `cover_image_url` là URL hợp lệ từ Shopee, không phải `0`.
- Mobile 390px trong tab `Chi tiết`: `bodyScrollWidth=390`, không tràn ngang; nút `Lưu thông tin video` hiện được; danh sách cover có `19` nút và đều là URL hợp lệ.

### Trạng thái vận hành

- Shop có API: `chihuy1984` sửa video bằng Shopee Video API riêng; backend tự fallback cover hợp lệ để người vận hành không bị lỗi khi chỉ sửa tiêu đề/sản phẩm.
- Shop không API: vẫn khóa sửa video bằng API; chỉ dùng luồng đăng tay/tham chiếu, không gắn nhãn đồng bộ API thật.
- Lazada/TikTok: chưa có adapter sửa video trong phase này; không bị ảnh hưởng.

## 2026-05-09 - Tách cache video Shopee đã đăng và bản nháp

### Việc đã làm

- Backend `/api/video/sync` chỉ lưu video Shopee `status=300` vào kho `Đã đăng`; các dòng `status=200` trả lẫn trong list `post` được bỏ qua và dọn khỏi cache sai bucket.
- Luồng xóa video phân biệt lại: video đã đăng dùng `post_id`, bản nháp/non-300 dùng `video_upload_id`, tránh xóa nhầm hoặc gọi sai định danh Shopee.
- Frontend `dashboard_video.html` đổi tiêu đề kho theo bộ lọc `Video đã đăng / Bản nháp / Video đã xóa trong cache` và ghi rõ nơi lấy lại video đã đồng bộ ngay trên bảng.

### Kiểm tra code

- `node --check apps/worker-api/src/routes/video.js` pass.
- `node --check apps/worker-api/src/core/video-analytics-core.js` pass.
- `node --check apps/fe/js/video-dashboard.js` pass.

### Deploy

- Worker API production: `4f3ebdaa-0ba1-480b-b762-cd806e1ae358`.
- Frontend production: `800fd418-4a3e-4acb-8806-435ef04832d4`.

### Kiểm production thật

- D1 production shop `chihuy1984` sau dọn cache: `281` video đã đăng thật, `7` bản nháp, `21` dòng đã xóa/cache xóa.
- Còn `176` video đã đăng thật có tiêu đề cũ `Bấm vào giỏ hàng...`; lần xóa trước chỉ xóa đúng `20` video đã chọn, không phải toàn bộ nhóm tiêu đề cũ.
- In-app browser production mở `dashboard_video`, chọn bộ lọc `Bản nháp`: tiêu đề bảng hiện `Bản nháp (7/7)`, dòng hướng dẫn hiển thị đúng số `Đã đăng thật: 281 · Bản nháp: 7 · Đã xóa trong cache: 21 · Tiêu đề cần xử lý: 176`, không có lỗi font tiếng Việt.

### Trạng thái vận hành

- Shop có API: `chihuy1984` đọc/xóa/sửa video bằng Shopee Video API; chưa tự bấm đăng lại bản nháp từ OMS vì đây là thao tác ghi thật cần thêm màn kiểm lỗi trước khi gọi `post_video`.
- Shop chưa API: vẫn dùng Chrome local/đăng tay, không gắn nhãn đồng bộ API.
- Lazada/TikTok: không bị ảnh hưởng bởi sửa cache Shopee.

## 2026-05-08 - Shop chưa API có job Chrome local để đăng video

### Việc đã làm

- Luồng `Đa shop` không còn chỉ lưu log đăng tay cho shop Shopee chưa API; giờ tạo job queue riêng trạng thái `browser_upload_required`.
- Cron API chỉ claim status `queued`, nên job Chrome local không bị cron API đăng nhầm.
- Worker thêm:
  - `GET /api/video/upload-queue/file` để helper local tải file video gốc từ R2 theo `queue_id`.
  - `POST /api/video/upload-queue/browser-status` để helper/local UI ghi trạng thái `browser_opening`, `browser_uploading`, `browser_preview_ready`, `browser_login_required`, `browser_error`, `browser_posted`.
- Local helper thêm route `POST/GET /video-upload-preview`; GET dùng cho trường hợp Chrome chặn fetch localhost từ web production.
- Thêm script `auto OMS Python/oms_python/platforms/shopee/video/browser_upload.py`:
  - mở đúng profile shop từ `data/shops.json`,
  - mở Shopee Creator Center,
  - tải file video từ R2 về máy,
  - nếu shop đã login thì đưa file vào input upload, điền caption nếu tìm thấy ô phù hợp, thử điền ô tìm sản phẩm nếu ô đã hiện,
  - dừng ở màn preview, không bấm đăng.
- UI log upload thêm nút `Mở Chrome preview` cho job Chrome local và nút `Đã đăng tay` để người vận hành xác nhận sau khi tự bấm đăng trên Seller Center.

### Kiểm tra code

- `node --check apps/worker-api/src/routes/video.js` pass.
- `node --check apps/worker-api/src/core/video-analytics-core.js` pass.
- `node --check apps/fe/js/video-dashboard.js` pass.
- `python -m py_compile` pass cho `local_helper/server.py` và `shopee/video/browser_upload.py`.
- `git diff --check` cho cụm video/helper pass, chỉ còn cảnh báo CRLF của `dashboard_video.html`.

### Deploy

- Worker API production: `192aaaec-dd2d-44bc-b00e-0c49c1de9051`.
- Frontend production cuối: `098b25cd-371f-4da5-a5c4-a0f7ba6f9c9e`.
- Local helper đã restart để nhận route `/video-upload-preview`.

### Kiểm production thật

- Production `dashboard_video.html` load đúng asset `video-dashboard.js?v=video-browser-upload-20260508a`.
- Tạo thử chiến dịch `vcmp_codex_browser_local_20260508a` cho shop chưa API `chihuy2309`: preview trả `status_code=manual_upload`, khi tạo queue trả `manual_rows[0].status=browser_upload_required`, R2 key dùng chung file campaign.
- Gọi helper local thật cho job test: helper mở Chrome profile `chihuy2309`, mở URL Shopee Creator Center và cập nhật job sang `browser_login_required` vì profile cần đăng nhập/xác minh Seller Center; không upload tiếp và không bấm đăng.
- UI production tab `Đa shop`/log shop `chihuy2309` hiển thị nút `Mở Chrome preview`; link trỏ về `http://127.0.0.1:8765/video-upload-preview?...`.
- Đã dọn dữ liệu test: hủy job, xóa `marketplace_video_upload_queue`, xóa `marketplace_video_action_logs` theo campaign/queue test, xóa file tạm local; kiểm lại `queue_count=0`, `log_count=0`.

### Trạng thái vận hành

- Shop có API: vẫn đi queue API Shopee Video riêng, cron chỉ chạy status `queued`.
- Shop chưa API: đi job Chrome local, phải mở đúng profile/login Seller Center, hệ thống chỉ tự đưa tới preview; người vận hành tự kiểm và tự bấm đăng, sau đó bấm `Đã đăng tay` để log.
- Lazada/TikTok: chưa nối luồng video browser/upload trong phase này.

## 2026-05-08 - Sửa lỗi cover khi sửa liên tiếp nhiều video Shopee

### Việc đã làm

- Backend `POST /api/video/edit` không còn ưu tiên mù `cover_image_url` do UI gửi lên. Cover chỉ được dùng nếu URL thuộc đúng `video_upload_id` hiện tại.
- Nếu UI còn giữ cover của video trước, backend tự bỏ qua và lấy lại cover đúng theo thứ tự: cache chi tiết, Shopee `get_cover_list`, rồi cache thư viện cùng video.
- Frontend tab `Chi tiết` thêm guard `preferredVideoCoverUrl`: khi đổi video, cover đang chọn phải chứa đúng `video_upload_id`; nếu không đúng thì reset về cover của video hiện tại.
- Nút `Kiểm tra hiệu suất video`/`Làm mới chi tiết` cũng reset lại detail, sản phẩm gắn kèm, cover và gợi ý AI theo video mới trước khi load sâu, tránh giữ form của video trước.
- HTML đổi cache bust sang `video-cover-per-video-20260508b`.

### Kiểm tra code

- `node --check apps/worker-api/src/routes/video.js` pass.
- `node --check apps/fe/js/video-dashboard.js` pass.
- `git diff --check` cho cụm video pass, chỉ còn cảnh báo CRLF của `dashboard_video.html`.

### Deploy

- Worker API production: `b08cec02-b087-4127-9206-70e23c6f202a`.
- Frontend production cuối: `d79fb3a6-c57c-459f-83c5-204173bc6575`.

### Kiểm production thật

- API production: cố tình gửi cover của video `vn-11110122-6v8go-mfygtcatbqj170` khi sửa video `vn-11110122-6v8gq-mhvjs56fzqip4b`; route vẫn trả `status=ok`, Shopee nhận lệnh thành công và cover phản hồi thuộc đúng video `vn-11110122-6v8gq-mhvjs56fzqip4b`.
- Frontend production trả đúng asset `video-dashboard.js?v=video-cover-per-video-20260508b`.
- Chrome production profile `ProductionAdminTest`: mở `dashboard_video.html?view=detail&shop=chihuy1984`, chuyển liên tiếp từ video `vn-11110122-6v8go-mfygtcatbqj170` sang `vn-11110122-6v8gq-mhvjs56fzqip4b`, cover grid có `22` ảnh và toàn bộ đều thuộc video mới.
- Bấm thật `Lưu thông tin video`: request `/api/video/edit` HTTP `200`, body UI gửi `cover_image_url` thuộc đúng video `vn-11110122-6v8gq-mhvjs56fzqip4b`, UI hiện `Đã gửi lệnh sửa thông tin video lên Shopee.`

### Trạng thái vận hành

- Shop có API: `chihuy1984` có thể sửa liên tiếp nhiều video trong tab `Chi tiết`; UI và backend đều khóa cover theo đúng video đang chọn.
- Shop chưa API: vẫn đi luồng Chrome local/đăng tay, không gọi sửa video API.
- Lazada/TikTok: chưa có adapter sửa video trong phase này; không bị ảnh hưởng.

## 2026-05-09 - Đánh giá khách hàng phase 1/2/3

### Việc đã làm

- Backend review core bổ sung:
  - `GET /api/reviews/actions` và `/api/reviews/action-logs` để đọc hàng đợi/log phản hồi review.
  - `POST /api/reviews/reply-suggest` để tạo gợi ý phản hồi từ review đã lưu, có guard chặn số điện thoại, kéo khách ra ngoài sàn, chuyển khoản và hứa bồi thường ngoài quy trình.
  - `POST /api/reviews/reply-action` để duyệt nháp, hủy, đánh dấu đã gửi tay hoặc ghi `send_locked` khi bấm gửi thật nhưng khóa live chưa mở.
- Frontend thêm page riêng `apps/fe/pages/reviews.html` và `apps/fe/js/reviews.js`:
  - Phase 1: tổng quan review, review xấu, cần trả lời, có media, thiếu mapping, review xấu trùng ADS.
  - Phase 2: chọn từng review còn quyền trả lời, tạo gợi ý phản hồi và lưu nháp vào hàng đợi.
  - Phase 3: xem hàng đợi/log, duyệt nháp, copy gửi tay, đánh dấu đã gửi tay, hủy hoặc thử gửi thật ở trạng thái khóa an toàn.
- `admin-products.html` thêm nút mở trang đánh giá từ khối `Review xấu theo sản phẩm`.
- `profit-dashboard.html` thêm link `Đánh giá khách hàng` trên sidebar.
- `auth-guard.js` thêm quyền truy cập `reviews.html` cho `admin`, `manager`, `cskh`, `reviewer`; tài khoản reviewer vẫn bị chặn POST theo guard chung.

### Shop có API

- Shopee/Lazada có API đọc review bằng endpoint chính thức đã nối trước đó và hiển thị trên page mới.
- Người vận hành có thể đồng bộ review đọc-only, repair mapping và tạo nháp phản hồi theo từng review.

### Shop không có API

- Không gọi Open Platform và không gắn nhãn đồng bộ API.
- Chỉ xem dữ liệu đã lưu/import trong review core; nếu cần phản hồi thì dùng nháp để copy gửi tay trên Seller Center và đánh dấu lại trong hàng đợi.

### Khóa an toàn

- Chưa tự gửi phản hồi thật lên Shopee/Lazada. Nút `Gửi thật` trên page mới chỉ cập nhật log sang `send_locked` để tránh phản hồi sai khách.
- Bước mở khóa sau phải test quyền `Product.reply_comment` và `/review/seller/reply/add`, có log request/response và chỉ mở cho shop/token hợp lệ.

## 2026-05-10 - AI auto-reply chat có runner, dry-run production và rà endpoint chat

### Việc đã làm

- Backend chat thêm cấu hình auto-reply trong `marketplace_chat_settings`:
  - `ai_auto_reply_mode`: `off / dry_run / live`
  - `ai_auto_reply_platforms`
  - `ai_auto_reply_limit`
  - `ai_auto_reply_hold_seconds`
  - `ai_auto_reply_max_age_hours`
  - `ai_auto_reply_handoff_enabled`
- Thêm bảng log `marketplace_chat_ai_auto_reply_logs` để lưu từng lượt tự xử lý theo `platform + shop + conversation_id + source_message_id`.
- Thêm runner `runChatAiAutoReplyBatch`:
  - chỉ chọn hội thoại API có tin cuối là khách nhắn,
  - chỉ lấy tin mới trong khung giờ an toàn, mặc định `2` giờ để tránh xử lý lại hội thoại cũ khi bật live,
  - bỏ hội thoại đã khóa AI tự động,
  - chống gửi lặp theo message nguồn,
  - gọi chung luồng `ai-draft -> guard`,
  - nếu đủ an toàn thì `live` mới gọi `/api/chat/send`,
  - nếu cần duyệt thì gửi/ghi câu giữ nhịp tùy mode và khóa hội thoại ở live.
- Worker cron 5 phút gọi runner nhưng chỉ hoạt động khi mode khác `off`.
- Thêm route `POST /api/chat/auto-reply/run` và `GET /api/chat/auto-reply/logs`.
- Frontend tab `AI & Luật` thêm khối `AI tự trả lời` với mode `Tắt / Chạy thử / Gửi thật`, chọn Shopee API hoặc Lazada IM API, giới hạn mỗi lượt, thời gian chờ, khóa tuổi tin mới tối đa theo giờ, công tắc câu giữ nhịp, nút `Chạy thử ngay` và `Tải log auto`.
- Production đã bật mode `dry_run` cho Shopee API, chưa bật `live`.

### Rà endpoint chat

- Shopee:
  - Repo đang dùng `sellerchat/get_conversation_list`, `sellerchat/get_message`, `sellerchat/send_message`.
  - Reference public local vẫn chưa có bản xác nhận đầy đủ, nên giữ trạng thái `guarded_internal`.
  - Còn thiếu docs/endpoint chính thức cho mark-read, recall, media chat và mở thread từ `order_sn`.
- Lazada:
  - Reference local có đủ 7 endpoint IM: `/im/session/list`, `/im/session/get`, `/im/message/list`, `/im/message/send`, `/im/session/open`, `/im/session/read`, `/im/message/recall`.
  - Repo đã nối `session/list`, `message/list`, `message/send` text và `session/read`.
  - Chưa nối `session/get`, `session/open`, `message/recall` và các template gửi media/thẻ/voucher/video/follow.

### Kiểm tra code

- `node --check apps/worker-api/src/routes/chat.js` pass.
- `node --check apps/worker-api/src/index.js` pass.
- `node --check apps/fe/js/dashboard/chat.js` pass.
- `git diff --check` pass cho cụm chat, chỉ có cảnh báo CRLF sẵn của một số file.
- Worker dry-run deploy pass.
- Frontend deploy bằng `wrangler deploy` cho Worker static assets; lệnh `wrangler pages deploy --dry-run` không dùng cho cấu hình hiện tại vì không có Pages project tương ứng.

### Deploy production

- Worker: `f8017e53-d229-4caf-9c8f-3f658020cfce`.
- Frontend/static assets: `93f93a24-e8bb-4b62-af65-adcfbbc9ea91`.

### Kiểm production thật

- Gọi `POST /api/chat/auto-reply/run` với `dry_run=true`, `platforms=["shopee","lazada"]`, `limit=2`, `hold_seconds=0`:
  - trả `status=ok`, `mode=dry_run`,
  - xử lý `2` hội thoại,
  - cả 2 đều `would_handoff`,
  - không gửi tin thật.
- Gọi lại `POST /api/chat/auto-reply/run` sau khi thêm khóa tuổi tin với `platforms=["shopee"]`, `limit=3`, `hold_seconds=20`, `max_age_hours=2`:
  - trả `status=ok`, `mode=dry_run`,
  - `candidates=0`, `processed=0`,
  - xác nhận không kéo lại hội thoại cũ khi không có tin khách mới trong 2 giờ.
- Bấm `Chạy thử ngay` trên UI production:
  - trả trạng thái `Chạy thử xong: 0 hội thoại, chế độ dry_run.`,
  - log production vẫn hiển thị các dòng `would_handoff` cũ để rà soát,
  - không gửi tin thật.
- Mở production bằng Chrome profile `ProductionAdminTest`:
  - asset JS/CSS đã load cache-bust `chat-auto-reply-20260510`,
  - modal `Cài đặt chat sàn` tab `AI & Luật` hiển thị khối `AI tự trả lời`,
  - mode hiện tại `dry_run`,
  - Shopee API được chọn, Lazada IM API chưa chọn,
  - ô `Chỉ xử lý tin mới tối đa (giờ)` hiển thị `2`,
  - ảnh kiểm lưu ở `artifacts/chat-auto-reply-production-safety.png`.

### Trạng thái vận hành

- Shop có API:
  - Shopee API đã bật canary `live` riêng shop `chihuy2309`, limit `1`, chỉ xử lý tin mới tối đa `2` giờ.
  - Lazada IM có đủ nền API text/read nhưng chưa bật trong auto-reply mặc định cho đến khi canary live.
- Shop không API:
  - Không chạy auto-reply từ Worker vì không có Chrome/server browser; vẫn dùng luồng helper/local hoặc thao tác tay có log.
- Bị khóa an toàn:
  - `live` không còn mở đại trà; nếu không có shop canary cụ thể thì Worker trả `disabled` và không xử lý hội thoại nào.
  - Runner chỉ lấy tin khách mới trong `2` giờ mặc định, tránh bật live rồi tự xử lý lại các hội thoại cũ.
  - Các hội thoại cần duyệt hoặc bị guard chặn sẽ không gửi nội dung AI tự do; chỉ có thể dùng câu giữ nhịp an toàn và khóa AI tự động khi live.

## 2026-05-10 - Bật canary live AI auto-reply cho Shopee shop chihuy2309

### Việc đã làm

- Backend thêm `ai_auto_reply_shops` vào `marketplace_chat_settings` và runner auto-reply.
- Runner chỉ chọn hội thoại có `platform` đúng cấu hình và `shop/shop_id` nằm trong danh sách canary.
- Khóa an toàn mới: nếu mode `live` nhưng không có shop canary thì route/cron trả `disabled`, không tự gửi cho toàn sàn.
- Frontend tab `AI & Luật` thêm ô `Shop canary được phép live` và truyền danh sách shop này khi lưu/chạy thử.
- Cache-bust FE đổi sang `chat-auto-reply-canary-20260510`.

### Deploy production

- Worker: `9c9c537a-00a8-439e-b14e-5700ac1246ca`.
- Frontend/static assets: `8c4aeea2-3a30-4601-aafb-8a88da4ae798`.

### Kiểm production thật

- Gọi `POST /api/chat/auto-reply/run` với `mode=live` nhưng `shops=[]`:
  - trả `status=disabled`,
  - lý do `Auto-reply live cần khai báo shop canary cụ thể.`,
  - `processed=0`.
- Gọi `POST /api/chat/auto-reply/run` ở `dry_run` riêng `shops=["chihuy2309"]`:
  - trả `status=ok`,
  - `shops=["chihuy2309"]`,
  - `candidates=0`, `processed=0`.
- Lưu production settings:
  - `ai_auto_reply_mode=live`,
  - `ai_auto_reply_platforms=["shopee"]`,
  - `ai_auto_reply_shops=["chihuy2309"]`,
  - `ai_auto_reply_limit=1`,
  - `ai_auto_reply_hold_seconds=20`,
  - `ai_auto_reply_max_age_hours=2`,
  - `ai_auto_reply_handoff_enabled=1`.
- Gọi route live theo settings sau khi lưu:
  - trả `mode=live`,
  - `dry_run=false`,
  - `shops=["chihuy2309"]`,
  - `candidates=0`, `processed=0`, không có tin cũ bị gửi.
- Mở UI production bằng Chrome profile `ProductionAdminTest`:
  - mode hiển thị `live`,
  - Shopee bật, Lazada tắt,
  - shop canary hiển thị `chihuy2309`,
  - limit `1`, chờ `20` giây, tuổi tin tối đa `2` giờ,
  - JS/CSS đã load `chat-auto-reply-canary-20260510`,
  - ảnh kiểm lưu ở `artifacts/chat-auto-reply-canary-chihuy2309.png`.

### Trạng thái vận hành

- Shop `chihuy2309` có thể được cron auto-reply live nếu có tin khách mới đủ điều kiện trong 2 giờ gần nhất.
- Các shop Shopee khác, Lazada, TikTok và shop không API chưa được live auto-reply.
- Bước tiếp theo là theo dõi log `marketplace_chat_ai_auto_reply_logs` vài vòng trước khi tăng limit hoặc thêm shop canary.

## 2026-05-10 - Sửa nút gửi tay trong chat không chạy

### Nguyên nhân

- Frontend `sendChatReply()` khai báo nội dung bằng `const text` nhưng sau bước guard lại gán lại `text = ...`.
- Lỗi này làm trình duyệt ném `Assignment to constant variable` trước khi vào khối gửi API, nên người vận hành bấm `Gửi` nhưng không thấy tin đi và UI không báo rõ.
- Hội thoại trong ảnh `phuongto.rt / chihuy2309` là hội thoại seed từ OMS:
  - `conversation_id=automation-shopee-seed-nhe6qz`,
  - `buyer_id` trống,
  - `transport=browser`.
  Vì vậy SellerChat API chính thức không gửi trực tiếp được; cập nhật mới: với shop API như `chihuy2309`, frontend vẫn gọi API trước, nếu đúng lỗi `missing_buyer_id` ở hội thoại seed OMS thì mới fallback helper local có kiểm soát.

### Việc đã làm

- Đổi biến trong `sendChatReply()` từ `const text` sang `let text`.
- Đổi cache-bust FE sang `chat-send-fix-20260510`.
- Deploy lại frontend/static assets.

### Deploy production

- Frontend/static assets: `abb37f85-5b50-480d-9895-2a413c285343`.

### Kiểm production thật

- `node --check apps/fe/js/dashboard/chat.js` pass.
- `git diff --check` pass cho cụm FE, chỉ còn cảnh báo CRLF sẵn có ở `profit-dashboard.html`.
- API production `GET /api/chat/conversations?q=phuongto.rt` xác nhận hội thoại ảnh đang là seed browser, chưa có `buyer_id`.
- API production `POST /api/chat/send` với hội thoại `phuongto.rt`, không dry-run:
  - trả HTTP `502`,
  - `error=missing_buyer_id`,
  - không gửi tin lên sàn.
- UI production bằng Chrome profile `ProductionAdminTest`:
  - JS đã load `chat-send-fix-20260510`,
  - bấm nút `Gửi` trong luồng kiểm có chặn request thật,
  - request `/api/chat/guard` và `/api/chat/send` đều được gọi,
  - không còn lỗi JavaScript,
  - ảnh kiểm lưu ở `artifacts/chat-send-fix-verify.png`.
- Helper local `http://127.0.0.1:8765/health` đang chạy OK.
## 2026-05-10 - Sửa phân loại shop API khi gửi chat Shopee seed từ OMS

### Nguyên nhân

- `chihuy2309` là shop Shopee có API: production `/api/chat/shops` trả `transport=api`, `scan_mode=api_direct`, `api_available=1`, `api_token_live=1`.
- Hội thoại `phuongto.rt / chihuy2309` là hội thoại seed từ OMS, chưa phải thread Shopee thật:
  - `conversation_id=automation-shopee-seed-nhe6qz`,
  - `buyer_id` trống,
  - tạo từ đơn `260508T7H2B2A8`.
- Code cũ ép mọi seed Shopee sang `transport=browser`, làm UI hiểu sai rằng shop API có thể fallback helper Chrome khi bấm `Gửi`.

### Việc đã làm

- Backend `orderSeedTransport()` đã đổi: Shopee có API giữ `transport=api`; chỉ shop Shopee chưa API mới dùng seed browser.
- Backend khi gửi Shopee official nếu thiếu `buyer_id` sẽ thử kéo metadata từ `/api/v2/sellerchat/get_conversation_list` theo tên khách trước khi báo lỗi.
- Backend lưu metadata hội thoại từ danh sách SellerChat để gắn `conversation_id/buyer_id/buyer_name` chính thức khi API trả đủ.
- Identity core không còn cho hội thoại chính thức Shopee/Lazada bị alias ngược vào seed/browser cũ.
- Frontend không còn fallback helper local cho hội thoại Shopee nếu shop resolve được là shop API.
- Cache-bust FE đổi sang `chat-api-shop-send-20260510`.

### Deploy production

- Worker: `cafb5be7-c8d6-4ce3-82b3-cf4da8a7af76`.
- Frontend/static assets: `f83375a1-3fc3-423d-826f-4fac902f63b2`.

### Kiểm production thật

- `node --check apps/worker-api/src/routes/chat.js` pass.
- `node --check apps/fe/js/dashboard/chat.js` pass.
- `git diff --check` pass cho cụm sửa, chỉ còn cảnh báo CRLF cũ ở `profit-dashboard.html`.
- Production `/api/chat/shops` xác nhận `chihuy2309` là Shopee API shop: `transport=api`, `scan_mode=api_direct`, token còn sống.
- Production `/api/chat/conversations?q=phuongto.rt` hiện `transport=api`, `scan_mode=api_direct`; không còn hiện là browser.
- Production `POST /api/chat/send` dry-run cho hội thoại seed `phuongto.rt` trả HTTP `502`, `error=missing_buyer_id`, không gửi tin lên sàn. Đây là kết quả đúng vì API chưa tìm được thread chính thức cho khách này.
- Production dry-run với thread Shopee API có sẵn `conversation_id=650712129903368193`, `buyer_id=151505724` trả HTTP `200` và sinh payload `/api/v2/sellerchat/send_message`, xác nhận luồng API vẫn gửi được khi thread có `buyer_id`.
- UI production bằng Chrome profile `ProductionAdminTest`:
  - tải `chat.js?v=chat-api-shop-send-20260510`,
  - thao tác Gửi qua dry-run chỉ gọi `/api/chat/send`,
  - không gọi helper local `/chat-send`,
  - UI báo đúng: shop có API nhưng hội thoại chưa có `buyer_id/to_id` chính thức,
  - ảnh kiểm lưu ở `artifacts/chat-api-shop-send-fix-verify.png`.

### Trạng thái vận hành

- Shop API `chihuy2309`: gửi Shopee SellerChat được khi hội thoại có `buyer_id/to_id` chính thức từ API.
- Hội thoại seed từ đơn chưa có thread thật: chưa gửi tự động được qua API; cần endpoint Shopee mở thread từ `order_sn` hoặc cần khách/shop có thread chat thật để `get_conversation_list` trả `buyer_id`.
- Shop không API: chỉ Shopee/TikTok mới dùng helper local có kiểm soát; Lazada vẫn không fallback Chrome.

## 2026-05-10 - Mở fallback có kiểm soát cho nút `Nhắn khách` từ đơn Shopee API

### Nguyên nhân cập nhật

- Thực tế vận hành cần bấm `Nhắn khách` từ đơn hàng để gửi ngay cho khách, nhưng Shopee API `send_message` bắt buộc có `buyer_id/to_id`.
- Với hội thoại seed OMS như `phuongto.rt / automation-shopee-seed-nhe6qz`, API không có `buyer_id` nên backend trả đúng `missing_buyer_id`.
- Open Platform đã rà nhưng chưa thấy endpoint chính thức mở thread từ `order_sn`; nếu khóa hoàn toàn ở API thì shop có API vẫn không nhắn được khách từ đơn chưa có thread thật.

### Việc đã làm

- Frontend `chat.js` nhận diện riêng hội thoại Shopee `oms_order_seed` hoặc `automation-shopee-seed-*` chưa có `buyer_id`.
- Luồng vẫn gọi `/api/chat/send` trước. Chỉ khi API trả lỗi fallback như `missing_buyer_id` mới cho helper local `/chat-send` xử lý theo tên khách.
- Không mở fallback đại trà cho mọi hội thoại shop API; hội thoại Shopee API đã có `buyer_id/to_id` vẫn gửi bằng SellerChat API chính thức.
- Helper local Shopee Webchat bỏ điều kiện cứng `y >= 300` khi tìm ô nhập; cửa sổ automation nhỏ vẫn nhận đúng textarea `Nhập nội dung tin nhắn`.
- Cache-bust FE đổi sang `chat-order-seed-api-fallback-20260510a` cho `chat-marketplace.html` và tab chat trong dashboard.

### Deploy và kiểm production

- `node --check apps/fe/js/dashboard/chat.js` pass.
- `python -m py_compile auto OMS Python/oms_python/features/chat/automation_browser.py` pass.
- Frontend/static deploy production version `078cb14f-9fa1-4c0b-99e8-86fc94a5d0ef`.
- Production chat page đã tải `chat.js?v=chat-order-seed-api-fallback-20260510a`.
- Production UI lọc `phuongto.rt` hiện đúng hội thoại `automation-shopee-seed-nhe6qz` và đơn `260508T7H2B2A8`.
- Production JS kiểm tra tại browser: seed OMS thiếu `buyer_id` trả `seedAllowsAutomation=true`, thread API có `buyer_id` trả `officialAllowsAutomation=false`, hội thoại API thường thiếu `buyer_id` nhưng không phải seed trả `false`.
- API dry-run cho thread chính thức `conversation_id=650712129903368193`, `buyer_id=151505724` vẫn trả payload `/api/v2/sellerchat/send_message` OK.
- API dry-run cho seed `phuongto.rt` vẫn trả `missing_buyer_id` như thiết kế.
- Helper local `/chat-send` dry-run cho `phuongto.rt / chihuy2309` đã mở Shopee Webchat, chọn đúng khách, điền nội dung, bấm `Gửi`, chặn request thật và bắt được `send_request_captured=true`.

### Trạng thái vận hành

- Shop API: API-first. Nếu hội thoại có `buyer_id/to_id` thì gửi Shopee API; nếu là seed từ đơn OMS thiếu `buyer_id`, hệ thống báo rõ và chuyển sang trình duyệt local có kiểm soát.
- Shop không API: tiếp tục dùng helper local theo cấu hình cũ.
- Phần vẫn thiếu endpoint: Shopee endpoint mở thread từ `order_sn` để bỏ hẳn fallback trình duyệt cho đơn mới chưa có thread chat thật.

## 2026-05-10 - Sửa đúng chuẩn API cho `Nhắn khách` từ đơn Shopee API

### Nguyên nhân mới xác định

- Open Platform Order API `/api/v2/order/get_order_detail` có `response_optional_fields=buyer_user_id,buyer_username`.
- Luồng chat từ đơn trước đó chỉ dựa vào `buyer_username/customer_name` và thread SellerChat đã có, nên hội thoại seed OMS không có `buyer_id/to_id`.
- `sellerchat/send_message` cần `to_id`; với shop API, `buyer_user_id` từ Order API chính là dữ liệu chuẩn cần lấy trước khi gửi.

### Việc đã làm

- Worker `chat.js` khi mở/gửi hội thoại seed từ đơn Shopee sẽ:
  - gọi `/api/v2/order/get_order_detail` để lấy `buyer_user_id/buyer_username`,
  - lưu `buyer_id/buyer_username` vào `orders_v2`,
  - cập nhật `marketplace_chat_conversations.buyer_id`,
  - gửi tiếp bằng `/api/v2/sellerchat/send_message` với `to_id`.
- Worker `api-sync.js` đã thêm `buyer_user_id,buyer_username` vào các lần gọi `get_order_detail` để các lượt đồng bộ sau tự có buyer id.
- Import `orders_v2` đã thêm cột `buyer_id,buyer_username` để dữ liệu core giữ định danh khách chuẩn, không chỉ lưu tên khách.
- Fallback trình duyệt chỉ còn là phương án phụ khi Order API cũng không trả được `buyer_user_id` hoặc shop không API.

### Deploy và kiểm production

- Worker API deploy version `0cf21575-b269-486f-a4d9-5f1c1ed12302`.
- Production resolve đơn `260508T7H2B2A8 / chihuy2309` đã lấy được `buyer_id=243511413`, `buyer_username=phuongto.rt`.
- D1 `orders_v2` đã có thêm cột `buyer_id,buyer_username` và đã lưu buyer id cho đơn test.
- D1 hội thoại `automation-shopee-seed-nhe6qz` đã cập nhật `buyer_id=243511413`, `identity_key=shopee|id:166563639|buyer:243511413`.
- Dry-run `/api/chat/send` cho hội thoại seed từ đơn trả HTTP `200`, payload Shopee chuẩn:
  - path `/api/v2/sellerchat/send_message`,
  - `to_id=243511413`,
  - `message_type=text`.
- UI production đã thao tác nút `Gửi` bằng route dry-run chặn gửi thật; request đi qua `/api/chat/send` và response trả payload `to_id=243511413`, không còn lỗi `missing_buyer_id`.

## 2026-05-10 - Rà trực tiếp Open Platform Shopee SellerChat và cập nhật local reference

### Việc đã kiểm tra trực tiếp

- Mở Shopee Open Platform bằng Chrome profile riêng `ShopeeOpenPlatform`, trang đang ở `https://open.shopee.com/developer-guide/12`.
- Gọi search của chính website Open Platform qua phiên đăng nhập, không dùng cache cũ:
  - `/opservice/api/v1/search/global?key=sellerchat...` trả `14` kết quả `v2.sellerchat.*`.
  - `/opservice/api/v1/portal_faq/detail?faq_id=137&language_code=en` mở được FAQ `API permission list for Customer Service App Type` và liệt kê `18` Chat API.
  - Mở chi tiết API bằng `/opservice/api/v1/doc/api/?api_name=...` cho nhóm SellerChat đang trả `error_auth: You have no permission of this document`, nên chưa lấy được schema request/response chính thức.

### Endpoint đã ghi vào local reference

- Nhóm đang repo đã nối: `get_message`, `get_conversation_list`, `send_message`.
- Nhóm Open Platform search thấy thêm: `get_one_conversation`, `read_conversation`, `unread_conversation`, `upload_image`, `pin_conversation`, `unpin_conversation`, `delete_conversation`, `get_unread_conversation_count`, `mute_conversation`, `unmute_conversation`, `send_autoreply_message`.
- Nhóm permission list/announcement nhắc thêm nhưng chưa mở được API detail: `get_offer_detail`, `reply_offer`, `get_offer_toggle_status`, `set_offer_toggle_status`, `delete_message`.
- Push `webchat_push` mở được và có dấu hiệu dùng làm webhook tin chat; cần đối chiếu thêm trước khi nối vào core.

### Kết luận vận hành

- Shop API `chihuy2309` vẫn là shop có API, nhưng endpoint mở thread từ `order_sn` chưa tìm thấy trên Open Platform.
- Các tên đoán như `create_conversation`, `open_conversation`, `open_session`, `get_conversation_by_order_sn`, `get_order_conversation`, `start_conversation` đều trả `error_not_exists`.
- Vì vậy hội thoại seed OMS thiếu `buyer_id/to_id` vẫn chưa gửi được hoàn toàn bằng API; hiện UI đã mở ngoại lệ fallback Chrome có kiểm soát sau lỗi `missing_buyer_id` để xử lý nút `Nhắn khách` từ đơn.

### File local đã cập nhật

- `C:\Users\Admin\.codex\skills\shopee-open-platform-docs\references\chat-endpoints.md`: thêm mục rà trực tiếp 2026-05-10, danh sách 18 endpoint, trạng thái `error_auth`, `webchat_push`, và kết luận chưa có endpoint mở thread từ `order_sn`.
- `C:\Users\Admin\.codex\skills\shopee-open-platform-docs\references\shopee\sellerchat-live-scan-2026-05-10.json`: lưu bản tra nhanh có `content_id`, path, mô tả ngắn, trạng thái mở detail và kết luận vận hành cho `chihuy2309`.

## 2026-05-10 - Thêm probe test quyền API thật cho Shopee SellerChat

### Vì sao cần thêm

- Open Platform website chỉ xác nhận tài liệu `doc/api` đang bị `error_auth`, nhưng chưa trả lời được token shop `chihuy2309` có quyền gọi endpoint nào.
- Cần một luồng probe bằng token shop thật để phân biệt:
  - endpoint gọi OK,
  - endpoint tới được nhưng thiếu/sai tham số,
  - endpoint thiếu quyền,
  - endpoint không tồn tại,
  - token hết hạn/sai token.

### Việc đã làm

- Backend thêm route `POST /api/chat/shopee-permission-probe`, yêu cầu quyền admin `chat.reply`.
- Probe dùng đúng helper ký Shopee hiện có trong `chat.js`, không tạo bộ ký riêng.
- Endpoint đọc được gọi thật: `shop/get_shop_info`, `sellerchat/get_conversation_list`, `get_unread_conversation_count`, `get_message`, `get_one_conversation`, `get_offer_toggle_status`, `get_offer_detail`.
- Endpoint ghi được probe bằng payload trống/sai tham số để không gửi tin, không upload, không xóa, không đổi trạng thái hội thoại: `send_message`, `send_autoreply_message`, `upload_image`, `read_conversation`, `unread_conversation`, `pin/unpin`, `mute/unmute`, `delete_conversation`, `delete_message`, `reply_offer`, `set_offer_toggle_status`.
- Frontend tab `AI & Luật` / danh sách shop API thêm card `Test quyền Shopee Chat`, có nút `Test quyền Chat` và tóm tắt kết quả theo nhóm.
- Cache-bust frontend đổi sang `chat-shopee-probe-20260510`.

### Guard an toàn

- Probe không dùng nội dung thật của khách.
- Probe ghi chỉ gửi body rỗng để Shopee trả lỗi quyền hoặc lỗi tham số; không có `to_id`, không có text, không có file, không có conversation_id hợp lệ cho thao tác thay đổi trạng thái.
- Kết quả trả về chỉ gồm phân loại lỗi, request_id, response keys và row count; không trả nội dung tin nhắn khách.

### Kết quả production đã probe cho `chihuy2309`

- Đã deploy Worker version `be185ca8-62e3-4932-a6ec-a222f88876cb` và frontend Pages deployment `c729e9df-2850-4d6a-98c4-fad724f22357`.
- Đã mở production `chat-marketplace.html?verify=shopee-probe-20260510`, xác nhận script đang chạy `chat.js?v=chat-shopee-probe-20260510` và có hàm `testShopeeChatApiFromSettings`.
- Gọi thật `POST /api/chat/shopee-permission-probe` cho `chihuy2309`, `shop_id=166563639`, kết quả `status=ok`, `discovered_conversation_id=650712129903368193`.
- Tóm tắt quyền: `ok=5`, `permission_blocked=4`, `reachable_param_error=11`.
- Endpoint OK: `shop/get_shop_info`, `sellerchat/get_conversation_list`, `get_unread_conversation_count`, `get_message`, `get_one_conversation`.
- Endpoint ghi tới được nhưng cố tình trả lỗi tham số vì payload rỗng/sai: `send_message`, `send_autoreply_message`, `upload_image`, `read_conversation`, `unread_conversation`, `pin_conversation`, `unpin_conversation`, `mute_conversation`, `unmute_conversation`, `delete_conversation`, `delete_message`.
- Endpoint bị Shopee chặn/offline/path chưa đúng: `get_offer_toggle_status`, `get_offer_detail`, `reply_offer`, `set_offer_toggle_status` đều trả `api_suspended`.
- Kết luận vận hành: `chihuy2309` có quyền SellerChat API lõi. `send_message` tới được nhưng phải có `buyer_id/to_id`; hội thoại seed từ OMS chưa có thread thật sẽ thử API trước, sau lỗi `missing_buyer_id` mới fallback helper local theo tên khách.
- Vẫn chưa tìm thấy endpoint chính thức mở thread từ `order_sn`, nên chưa mở tự động gửi cho đơn chưa có hội thoại chat thật.

## 2026-05-10 - Rà Open Platform và sửa đọc media/emoji Shopee Chat

### Open Platform đã kiểm trực tiếp

- Search live trên `open.shopee.com` bằng profile `ShopeeOpenPlatform` với `lang_code=en&page_no=1&page_size=10`.
- Xác nhận `v2.sellerchat.upload_image` tồn tại: muốn gửi tin dạng ảnh thì phải gọi upload ảnh trước để lấy image URL, rồi gọi `v2.sellerchat.send_message` với image URL.
- Xác nhận `v2.sellerchat.send_message` vẫn là endpoint gửi text/image chính; không dùng để gửi hàng loạt và TW không hỗ trợ.
- Rà lại Open Platform theo gợi ý video và mở announcement `Important OpenAPI Updates for Payment, Chat and Ads API` (`content_id=1052`): Shopee ghi rõ luồng video chat là `v2.sellerchat.upload_video` -> `v2.sellerchat.get_video_upload_result` -> `v2.sellerchat.send_message` với `message_type=video`.
- `doc/api` cho `v2.sellerchat.upload_video`, `v2.sellerchat.get_video_upload_result` và `v2.sellerchat.send_message` vẫn trả `error_auth`, nên đã có tên endpoint nhưng chưa mở được schema request/response chi tiết.
- `webchat_push` official doc có ví dụ text chứa emoji trong `content.text`, ví dụ image trong `content.url`, và ví dụ video trong `content.video_url`/`thumb_url`.
- `doc/api` theo `api_id=671/672/683` vẫn trả `error_auth`, nên chưa mở được request schema chi tiết của `upload_image`.

### Code đã cập nhật

- Core normalize Shopee Chat ưu tiên `message_type=image/video/sticker/emoji` trước `source_content.item_id`, tránh ảnh có item_id bị hiểu nhầm là thẻ sản phẩm.
- Sửa `collectMediaItems`: nếu raw payload là `message_type=image` nhưng URL nằm ở field chung `content.url`, media vẫn được phân loại là `image` thay vì `file`.
- Thêm nhánh gửi ảnh Shopee trong `/api/chat/send`: upload ảnh qua `/api/v2/sellerchat/upload_image`, sau đó gửi `/api/v2/sellerchat/send_message` với `message_type=image`.
- Thêm probe `include_sample_image_upload_probe` vào `/api/chat/shopee-permission-probe`: upload ảnh mẫu 1x1 để test endpoint mà không gửi tin cho khách.
- Với video gửi đi: thêm nhánh API có guard cho `upload_video`, `get_video_upload_result`, sau đó thử `send_message` với `message_type=video`; nếu Shopee vẫn trả lỗi schema thì dừng ở lỗi rõ ràng, không fallback browser.

### Kiểm production

- Deploy Worker version `f2356ece-b9ee-4801-8c3c-3a6765961de8`.
- Deploy Worker version `98938eaf-f608-45be-aec3-aa50effdf422` sau khi gắn endpoint video chat.
- Probe production `chihuy2309` sau deploy: `/api/v2/sellerchat/upload_video` và `/api/v2/sellerchat/get_video_upload_result` đều trả `param_error` với payload trống, phân loại `reachable_param_error`. Kết luận: app/shop chạm được endpoint video, không bị `permission_blocked`; phần còn thiếu là schema field upload/result.
- Dry-run production `/api/chat/send` với attachment video trả payload đúng flow `upload_video -> get_video_upload_result -> send_message video`, `to_id=14909946`, chưa upload/gửi thật vì đang chạy `dry_run`.
- Probe production `chihuy2309` với `include_sample_image_upload_probe=true`: endpoint `/api/v2/sellerchat/upload_image` tới được nhưng trả `param_error` cho các biến thể đã thử `image`, `file`, `image_file`, base64 và data URL; chưa gửi tin cho khách.
- Dry-run `/api/chat/send` multipart ảnh trên production trả payload dự kiến `upload_image -> send_message image`; không gửi thật vì hội thoại test đang là seed chưa có `buyer_id/to_id`.
- Làm sạch D1 production: 24 tin Shopee `message_type=image` đang bị lưu `media_items.type=file` đã đổi sang `image`, preview đổi về `Đã gửi hình ảnh`.
- Mở production bằng Chrome profile `ProductionAdminTest`, gọi `/api/chat/messages?id=117590` và mở hội thoại thật: API trả media `type=image`, DOM render được `2` ảnh qua `.chat-media-image`.

### Trạng thái vận hành

- Đã xong: đọc text có emoji không bị strip; đọc sticker/image/video inbound đúng hướng theo schema official push và raw payload đang có.
- Đã xong: ảnh cũ bị phân loại sai đã được dọn trong D1.
- Đang khóa: gửi ảnh thật lên Shopee chưa bật vì `upload_image` vẫn thiếu schema request chính thức, probe thật đang trả `param_error`.
- Đã tìm thấy endpoint video chat trong announcement Open Platform: `v2.sellerchat.upload_video` và `v2.sellerchat.get_video_upload_result`. Phần còn thiếu là schema chi tiết do `doc/api` đang bị `error_auth`; production probe sẽ kiểm quyền runtime bằng payload sai tham số an toàn.

## 2026-05-10 - Rà lại Trung tâm video Shopee: token, sửa tiêu đề, xóa và đăng video

### Open Platform đã kiểm trực tiếp

- Mở live `open.shopee.com` bằng profile `ShopeeOpenPlatform` và gọi `doc/api` cho nhóm Shopee Video/Media.
- Xác nhận endpoint đang dùng là đúng:
  - `v2.media.init_video_upload` -> `v2.media.upload_video_part` -> `v2.media.complete_video_upload` -> `v2.media.get_video_upload_result`.
  - `v2.video.get_cover_list`.
  - `v2.video.edit_video_info`.
  - `v2.video.post_video`.
  - `v2.video.delete_video`.
- Ràng buộc quan trọng trong docs live: `edit_video_info` chỉ dùng để set/update thông tin trước khi video được post; sau khi submit video vẫn là draft và phải gọi `post_video`. Vì vậy OMS không được gọi sửa tiêu đề/cover/sản phẩm cho video đã đăng.
- `delete_video` cho phép xóa cả draft và post, nhưng draft phải gửi `video_upload_id_list`, còn video đã đăng phải gửi `post_id_list`; chỉ được chọn một nhóm ID mỗi request.
- `post_video` nhận tối đa `5` `video_upload_id` mỗi lần và trả `success_list/failure_list`.

### Lỗi/root cause tìm thấy

- Production trước khi xử lý: `chihuy1984` và `chihuy2309` đều có app/quyền Shopee Video nhưng `video_access_token` đã hết hạn từ `2026-05-09`, nên `/api/video/capabilities` trả `video_ready=0`, `video_sync_mode=api_needs_auth`; UI khóa đăng/sửa/xóa dù endpoint và refresh token còn dùng được.
- UI tab `Chi tiết` vẫn mở form sửa cho video `status=300/list_type=post`, trong khi API chỉ cho sửa trước khi đăng. Đây là nguyên nhân hợp lý cho lỗi sửa tiêu đề video đã đăng.
- Backend `edit_video_info` và luồng upload/post chưa kiểm `response.failure_list`; có rủi ro Shopee trả lỗi theo từng video nhưng OMS vẫn báo thành công.
- Hàm gom target xóa cần ưu tiên `post_id` cho video đã đăng ngay cả khi row có cả `post_id` và `video_upload_id`.

### Code đã cập nhật

- Backend tự refresh Shopee Video token khi token hết hạn hoặc gần hết hạn:
  - trong `/api/video/capabilities`;
  - trong `/api/video/shopee/media-endpoints`;
  - trước khi gọi các endpoint Video API `GET/POST/POST raw`.
- Route `/api/shops/force-refresh-video-token` trả thêm `video_token_expire_at`, `video_last_api_refresh_at`, `video_api_refresh_expire_at` để caller cập nhật row đang chạy.
- `/api/video/edit` có `dry_run=1`, trả payload dự kiến nhưng không gọi sàn.
- `/api/video/edit` chặn video đã đăng theo `status=300`, `list_type=post` hoặc có `post_id` không phải draft; message giải thích chỉ sửa được bản nháp/chưa đăng.
- Frontend tab `Chi tiết` khóa nút `Lưu thông tin video` với video đã đăng, chỉ giữ nút `Xóa video`; bản nháp vẫn hiện form sửa.
- Luồng `edit_video_info` và `post_video` kiểm `success_list/failure_list`; nếu Shopee trả failure theo video thì OMS báo lỗi thật, không báo thành công giả.
- Xóa video đã đăng ưu tiên `post_id_list`; draft mới dùng `video_upload_id_list`.
- Cache-bust frontend đổi sang `video-api-write-guard-20260510a`.

### Kiểm production

- Đã refresh token video thật bằng route hiện có cho:
  - `chihuy1984`: HTTP `200`, `expire_seconds=14400`.
  - `chihuy2309`: HTTP `200`, `expire_seconds=14400`.
- Sau refresh, `/api/video/capabilities` production trả:
  - `chihuy1984`: `video_ready=1`, `video_sync_mode=api_live`, `supports_shopee_media_api=1`.
  - `chihuy2309`: `video_ready=1`, `video_sync_mode=api_live`, `supports_shopee_media_api=1`.
- Deploy Worker version `257e4b62-731c-4acc-be99-a77d90722e4f`.
- Deploy Frontend version `0de73fdb-3f56-4213-9c54-bfdc1c8fe536`.
- Production dry-run không gửi lệnh thật:
  - `/api/video/delete` với video đã đăng `pMJ5ptRWCABFtiIKAAAAAA==` trả `targets.post_ids=["pMJ5ptRWCABFtiIKAAAAAA=="]`, `video_upload_ids=[]`.
  - `/api/video/edit` dry-run với video đã đăng trả `status=blocked`, `can_edit=false`, không gọi sàn.
  - `/api/video/edit` dry-run với draft `vn-11110122-6v8gp-me4sjuzfx1c659` trả `status=ok`, `can_edit=true`, có `cover_image_url` hợp lệ trong `edit_body`.
  - `/api/video/test-permission` cho `chihuy1984` trả HTTP `200`, message `Test quyền Shopee Video OK`.
  - `/api/video/shopee/media-endpoints?shop=chihuy1984` trả `media_video_ready=1`, `media_space_ready=1`.
  - `/api/video/upload-queue/run` dry-run cho `chihuy1984` trả HTTP `200`, không đăng video thật.
- Mở production `dashboard_video.html?view=detail&shop=chihuy1984&verify=video-api-write-guard-20260510a` bằng Chrome profile `ProductionAdminTest`:
  - trang tải đúng asset `video-dashboard.js?v=video-api-write-guard-20260510a`;
  - chọn video đã đăng: edit panel hiện cảnh báo khóa sửa, không còn `#videoSaveEditBtn`, vẫn có `#videoDeleteBtn`;
  - chọn `Bản nháp`: form sửa vẫn hiện `#videoSaveEditBtn` và `#videoDeleteBtn`;
  - mobile 390px: `body.scrollWidth=390`, không tràn ngang.

### Trạng thái vận hành

- Shop có API Video: `chihuy1984` và `chihuy2309` hiện lại `api_live`; OMS tự refresh token video trước khi khóa UI/gọi API.
- Sửa tiêu đề/cover/sản phẩm: chỉ bật cho draft/chưa đăng theo giới hạn Open Platform. Video đã đăng phải xóa/đăng lại hoặc xử lý trong Seller Center nếu Shopee cho sửa tay.
- Xóa video: vẫn là lệnh thật, nhưng đã có modal xác nhận và backend dry-run; video đã đăng dùng `post_id`, draft dùng `video_upload_id`.
- Đăng video: endpoint đủ theo docs; OMS vẫn giữ guard xác nhận, kiểm thời lượng, cover, `success_list/failure_list` trước khi báo thành công.

## 2026-05-11 - Sửa lọc ngày Profit Dashboard và đối chiếu đơn hoàn thành Shopee

### Lỗi/root cause tìm thấy

- Khi chọn một shop Shopee trong bộ lọc, frontend gửi đồng thời `platform=shopee` và `shop=chihuy1984` vào `/api/dashboard`.
- Route `/api/dashboard` có query join với `marketplace_return_reverse_ledger` nhưng phần WHERE tổng hợp hủy/hoàn dùng điều kiện `platform = ?` chưa gắn alias `o.`, làm D1 lỗi `ambiguous column` và production trả HTTP 500. Vì `loadDashboard()` dùng `Promise.all`, UI giữ lại KPI cũ nên nhìn giống như bấm lọc ngày/shop không đổi.
- KPI cũ ghi `Đơn Thành Công` nhưng đang lấy `order_type='normal'`, tức là đơn hợp lệ chưa hủy/hoàn. ShipXanh thường đối chiếu theo trạng thái đã giao/hoàn thành, nên cần tách rõ `completed_orders` với `total_orders`.

### Code đã cập nhật

- Backend `/api/dashboard` dùng helper `buildAllOrderWhere(filters, prefix)` để bỏ điều kiện `order_type='normal'` nhưng vẫn giữ alias khi query có join.
- `dashboardStatusAggregate()` trả thêm `completed_orders`, `shipping_orders`, `shop_completed_orders`, `shop_shipping_orders` dựa trên `order_status_core`.
- Frontend `kpi.js` đổi KPI chính thành `Đơn Hoàn Thành`, dòng phụ hiện `Hợp lệ chưa hủy/hoàn` và `Tổng đơn`.
- Bộ lọc ngày tay trong `filters.js` tự bỏ trạng thái chọn nhanh/tháng để tránh hiểu nhầm là vẫn đang lọc cả tháng.
- Cache-bust `profit-dashboard.html` đổi sang `dashboard-filter-platform-20260511`.

### Kiểm production

- Deploy Worker version `cb003b99-fddf-45c2-a6ea-e04a26978f5f`.
- Deploy Frontend version `754ac277-00a5-4be6-ab21-62014194a85b`.
- API production `/api/dashboard?from=2026-04-01&to=2026-04-30&platform=shopee&shop=chihuy1984` trả HTTP 200:
  - `completed_orders=611`.
  - `total_orders=612`.
  - `shipping_orders=1`.
  - `total_all_orders=1007`.
  - `cancel_orders=176`.
  - `return_orders=219`.
- API production lọc riêng ngày `2026-04-01` cùng shop/sàn trả HTTP 200:
  - `completed_orders=40`.
  - `total_orders=40`.
  - `total_all_orders=46`.
- Mở production bằng Chrome profile `ProductionAdminTest`, thao tác thật:
  - chọn shop `chihuy1984`, chọn `Tháng 4`: UI gửi `/api/dashboard?from=2026-04-01&to=2026-04-30&platform=shopee&shop=chihuy1984`, KPI hiện `Đơn Hoàn Thành 611`, dòng phụ `Hợp lệ chưa hủy/hoàn: 612 · Tổng 1.007 đơn`, bảng ngày có các dòng từ `2026-04-01`.
  - sửa ngày tay thành `01/04/2026 -> 01/04/2026` và bấm `Lọc`: UI gửi `/api/dashboard?from=2026-04-01&to=2026-04-01&platform=shopee&shop=chihuy1984`, KPI hiện `Đơn Hoàn Thành 40`, bảng chỉ còn dòng `2026-04-01` và dòng `Tổng`.
  - Không ghi nhận fetch lỗi hoặc JS error trong luồng kiểm.

### Trạng thái vận hành

- Shop Shopee có API: Dashboard lọc ngày/shop/sàn đọc trực tiếp từ `orders_v2` đã chuẩn hóa trạng thái; số ShipXanh nên đối chiếu với `Đơn Hoàn Thành`, không lấy dòng `Hợp lệ chưa hủy/hoàn`.
- Shop không API: vẫn lọc theo dữ liệu import/browser đã ghi vào `orders_v2`; nếu trạng thái chưa có `COMPLETED`, KPI hoàn thành sẽ phản ánh đúng phần dữ liệu còn thiếu thay vì tự suy diễn.
- Cần theo dõi tiếp: nếu ShipXanh vẫn lệch so với `completed_orders=611` cho `chihuy1984` tháng 4, bước sau cần đối chiếu danh sách mã đơn thiếu/thừa giữa ShipXanh và `orders_v2`, không chỉ so KPI tổng.

## 2026-05-11 - Sửa guard thời lượng file trong luồng Shopee Video đa shop

### Lỗi/root cause tìm thấy

- Frontend `dashboard_video.html` tab `Đa shop` đã đọc được metadata file và hiển thị `File hợp lệ`, nhưng `state.multiShopFileMetaError` lại được dùng để chứa cả thông báo thành công.
- Khi bấm `Tạo lịch API / job Chrome`, guard `validateMultiCampaignMeta(true)` chỉ cần thấy biến này có nội dung là chặn và báo `Chưa đọc được thời lượng thật từ file video gốc`, dù input thời lượng đã có số giây hợp lệ.

### Code đã cập nhật

- `apps/fe/js/video-dashboard.js`: tách rõ thông báo thành công khỏi biến lỗi; biến `multiShopFileMetaError` chỉ còn lưu lỗi/đang đọc metadata thật.
- Guard tạo chiến dịch bắt buộc có `state.multiShopFileMeta.durationSeconds` lớn hơn 0, nên vẫn khóa đúng khi file chưa đọc metadata thật.
- `apps/fe/pages/dashboard_video.html`: cache-bust asset sang `video-dashboard.js?v=video-multi-duration-20260511a`.

### Kiểm production

- `node --check apps/fe/js/video-dashboard.js` pass.
- `git diff --check -- apps/fe/js/video-dashboard.js apps/fe/pages/dashboard_video.html` pass; chỉ có cảnh báo CRLF sẵn có của `dashboard_video.html`.
- Deploy frontend version `114e3f82-e2c5-445c-b585-d5f0c9bd09f5`.
- Mở production bằng Chrome profile `ProductionAdminTest`: `dashboard_video.html?shop=chihuy1984&view=multi&verify=video-multi-duration-20260511a`.
- Trang load đúng asset `video-dashboard.js?v=video-multi-duration-20260511a`.
- Chọn file test thật `sample-shopee-video.mp4`: UI báo `File hợp lệ: 39 giây`, input `Thời lượng video` tự điền `39`.
- Điền riêng shop `chihuy1984`, bấm `Kiểm tra chiến dịch`: status trả `Đã kiểm tra chiến dịch: 1 shop tạo lịch API, 0 shop cần Chrome local`.
- Bấm `Tạo lịch API / job Chrome`: trình duyệt hiện confirm `Tạo chiến dịch video cho 1 shop API và 0 shop Chrome local?`; không còn cảnh báo `Chưa đọc được thời lượng thật từ file video gốc`. Đã dismiss confirm, không tạo queue thật bằng file mẫu để tránh dữ liệu vận hành giả.

### Trạng thái vận hành

- Shop có API: `chihuy1984` đi tiếp được qua guard tạo lịch sau khi file đọc metadata hợp lệ.
- Shop không API: luồng Chrome local không đổi; vẫn chỉ tạo job khi người vận hành xác nhận thật.
- Đang khóa: file chưa đọc được thời lượng thật hoặc thời lượng ngoài `1-180 giây` vẫn bị chặn trước khi gửi lên backend.

## 2026-05-11 - Tìm SKU để gắn sản phẩm trong Shopee Video đa shop

### Lỗi/root cause tìm thấy

- UI `Đa shop` đang bắt người vận hành tự nhập `item_id` cho trường `Sản phẩm gắn kèm`, trong khi thao tác thực tế cần tìm theo mã SKU như `K263`, xem đúng sản phẩm của từng shop rồi bấm gắn.
- API catalog video chỉ tìm `product_name / item_sku / item_id`, chưa tìm trong JSON `variations`, nên SKU biến thể/model SKU có thể không hiện dù sản phẩm đã có trong catalog.

### Code đã cập nhật

- `apps/worker-api/src/core/video-analytics-core.js`: `listVideoCatalogProducts()` tìm thêm trong `marketplace_product_knowledge.variations`, trả `shop_id`, `matched_sku`, `matched_variation_name`, tồn kho, trạng thái có video và `product_url` Shopee.
- `apps/fe/js/video-dashboard.js`: trường `Sản phẩm gắn kèm` trong luồng `Đa shop` đổi thành ô `Tìm SKU`, kết quả có ảnh/tên/SKU/item ID/link `Mở sản phẩm` và nút `Gắn`; payload queue/preview vẫn gửi `item_id` chuẩn theo từng shop.
- `apps/fe/css/video-dashboard.css`: thêm layout mobile-first cho picker, sản phẩm đã gắn và danh sách kết quả.
- `apps/fe/pages/dashboard_video.html`: cache-bust asset sang `video-product-picker-20260511a`.

### Kiểm production

- `node --check apps/fe/js/video-dashboard.js`, `node --check apps/worker-api/src/core/video-analytics-core.js` và `node --check apps/worker-api/src/routes/video.js` pass.
- `git diff --check` pass; chỉ còn cảnh báo CRLF sẵn có của `dashboard_video.html`.
- Deploy Worker version `18db06d8-f11d-453f-9035-3c7116dc5933`.
- Deploy Frontend version `173ef58d-f76c-40ee-813e-f0db569dd54a`.
- API production `/api/video/catalog-items?platform=shopee&shop=chihuy2309&query=K263&limit=5` trả sản phẩm `item_id=28027443255`, `matched_sku=K263-AS10`, `product_url=https://shopee.vn/product/166563639/28027443255`.
- Mở production bằng Chrome profile `ProductionAdminTest`, tab `Đa shop`, asset đúng `video-product-picker-20260511a`.
- Tìm SKU `K263` tại shop `chihuy2309`: UI hiện sản phẩm, link `Mở sản phẩm` mở đúng Shopee URL, bấm `Gắn` thì sản phẩm đã gắn giữ `item_id=28027443255`.
- Bật riêng shop `chihuy2309`, điền tiêu đề test và bấm `Kiểm tra chiến dịch`: preview trả `1 shop tạo lịch API, 0 shop cần Chrome local`, badge dòng shop chuyển `Chờ đăng`. Không bấm tạo queue thật.
- Kiểm viewport mobile `390x844`: `scrollWidth=375`, không tràn ngang; kết quả tìm SKU hiển thị đủ link và nút `Gắn`.

### Trạng thái vận hành

- Shop có API Shopee Video: gắn sản phẩm bằng catalog thật theo `platform + shop`; preview/queue vẫn guard sản phẩm tồn tại trong catalog trước khi gửi lệnh.
- Shop không API Shopee Video: picker vẫn giúp lấy đúng sản phẩm và link kiểm tra, nhưng upload thật đi luồng Chrome local/đăng tay có log; không gắn nhãn đồng bộ API.
- Lazada/TikTok: không đổi trong phase này; chưa nối vào luồng đăng video đa shop Shopee.

## 2026-05-12 - Khóa đúng catalog shop và sửa layout picker sản phẩm video đa shop

### Lỗi/root cause tìm thấy

- Shop chưa API như `khogiadungcona` và `phambich2312` chưa có catalog riêng trong `marketplace_product_knowledge`, nên không được lấy sản phẩm/link từ shop khác để gắn vào video.
- CSS desktop của form đa shop chia 4 cột, làm ô `Sản phẩm gắn kèm` chỉ còn khoảng 150px; tên sản phẩm bị ép xuống từng chữ và khó bấm `Mở sản phẩm / Gắn`.

### Code đã cập nhật

- `apps/worker-api/src/core/video-analytics-core.js`: khóa tìm catalog theo đúng `platform + shop`; không fallback sang shop khác.
- `apps/worker-api/src/routes/video.js`: preview đa shop luôn kiểm sản phẩm trong catalog đúng shop, kể cả shop chưa API.
- `apps/fe/js/video-dashboard.js`: khi shop chưa có catalog riêng sẽ báo rõ cần đồng bộ/nhập catalog đúng shop; không hiện link shop khác và không cho bấm `Gắn`.
- `apps/fe/css/video-dashboard.css`: picker sản phẩm span toàn hàng trong form đa shop, card kết quả/đã gắn đủ rộng trên desktop và vẫn không tràn mobile.
- `apps/fe/pages/dashboard_video.html`: cache-bust asset sang `video-product-picker-20260512b`.
- Các điểm sửa mới có comment `NEO:` bằng tiếng Việt để lần sau tìm nhanh.

### Kiểm production

- `node --check apps/fe/js/video-dashboard.js`, `node --check apps/worker-api/src/core/video-analytics-core.js`, `node --check apps/worker-api/src/routes/video.js` pass.
- Deploy Worker version `2c1cccbf-e613-4416-af07-11f170dd4141` trước đó đã bị thay thế trong đợt khóa lại đúng shop; xem mục kiểm sau của đợt sửa `video-product-picker-20260512b`.
- Deploy Worker version `616fc4dd-9f52-4328-afbc-fc3ee4aea967`.
- Deploy Frontend version `ca10c628-7ff8-4c53-b409-a5e6ba9569d5`.
- API production `catalog-items` cho `khogiadungcona` và `phambich2312` với `query=k263&fallback=1` đều trả `rows=[]`, xác nhận không còn trả link/item của `chihuy2309/chihuy1984`.
- API production cho `chihuy1984` với `query=k263` vẫn trả đúng sản phẩm của `chihuy1984`, gồm `item_id=26277431122`, `matched_sku=K263-AS10`.
- Mở production bằng Chrome profile `ProductionAdminTest`, tab `Đa shop`, asset đúng `video-product-picker-20260512b`.
- Shop `khogiadungcona`: tìm `k263` không hiện sản phẩm/link shop khác, UI báo `Catalog riêng của shop này chưa có sản phẩm khớp SKU/tên...`.
- Shop `chihuy1984`: tìm `k263` hiện `2` kết quả, bấm `Gắn` giữ `item_id=26277431122`, card desktop rộng `800px` và không còn chữ rơi từng chữ.
- Kiểm mobile `390x844`: `scrollWidth=375`, không tràn ngang.

### Trạng thái vận hành

- Shop có API: vẫn dùng catalog riêng của shop và chỉ queue API khi guard sản phẩm qua đúng shop đó.
- Shop chưa API: phải đồng bộ/nhập catalog riêng đúng shop trước; không dùng catalog tham chiếu của shop khác.
- Đang khóa: nếu shop chưa có catalog riêng, UI báo cần đồng bộ/nhập thêm dữ liệu sản phẩm trước khi tạo job.

## 2026-05-12 - Phase 1+2 tách video đa shop và nối catalog local helper đúng shop

### Code đã cập nhật

- Frontend tách picker sản phẩm đa shop ra `apps/fe/js/video/multi-shop/product-picker.js`; `video-dashboard.js` chỉ còn wrapper mỏng để gọi module theo tính năng.
- CSS đa shop tách ra `apps/fe/css/video/multi-shop.css`; `dashboard_video.html` link CSS riêng và cache-bust sang `video-multishop-split-20260512a`.
- Backend tách catalog video sang `apps/worker-api/src/core/video/catalog-core.js`; route video import core mới thay vì giữ logic catalog trong `video-analytics-core.js`.
- Backend thêm `apps/worker-api/src/core/product/product-knowledge-sync-core.js`; `/api/sync-variations` khi nhận `products` từ API hoặc Chrome/local helper sẽ lưu thêm `marketplace_product_knowledge` và `marketplace_product_catalog_snapshots` đúng `platform + shop`.
- Các điểm tách mới có comment `NEO:` tiếng Việt, nhấn mạnh catalog video đa shop chỉ đọc đúng shop và cấm fallback link/item shop khác.

### Kiểm tra đã chạy

- `node --check apps/fe/js/video-dashboard.js` pass.
- `node --check apps/fe/js/video/multi-shop/product-picker.js` pass.
- `node --check apps/worker-api/src/core/video/catalog-core.js` pass.
- `node --check apps/worker-api/src/core/product/product-knowledge-sync-core.js` pass.
- `node --check apps/worker-api/src/routes/products.js` pass.
- `node --check apps/worker-api/src/routes/video.js` pass.
- `python -m py_compile auto OMS Python/oms_python/platforms/shopee/products/shopee_products_browser.py` pass.

### Deploy và kiểm production

- Deploy Worker version `88f90a06-02f0-4efb-a3bd-1c663d980429`.
- Deploy Frontend version `5067719d-7089-406f-a41b-e98ec72ed8d5`.
- API production `/api/video/catalog-items?platform=shopee&shop=khogiadungcona&query=K263&fallback=1` trả `rows=[]`, xác nhận không fallback link/item shop khác.
- API production `/api/sync-variations` đã nhận payload sản phẩm local helper của `khogiadungcona` và lưu `saved_product_knowledge=1`, `saved_product_catalog_snapshots=1`.
- API production `/api/video/catalog-items?platform=shopee&shop=khogiadungcona&query=K262` trả đúng item `27876648870`, SKU `K262_BO20TACKETHACHCAO`, link `https://banhang.shopee.vn/portal/product/27876648870` của chính shop `khogiadungcona`.
- API production `/api/video/catalog-items?platform=shopee&shop=chihuy1984&query=K263` vẫn trả đúng 2 sản phẩm của `chihuy1984`, gồm item `26277431122`.
- Mở production bằng Chrome profile `ProductionAdminTest`, tab `Đa shop`, asset đang chạy đúng `video-multishop-split-20260512a`.
- UI production shop `khogiadungcona`: tìm `K262` hiện 1 kết quả và bấm `Gắn` được item `27876648870`; tìm `K263` trả 0 kết quả và báo rõ hệ thống không lấy link shop khác.
- UI production shop `chihuy1984`: tìm `K263` hiện 2 kết quả, link `https://shopee.vn/product/170044686/26277431122`, bấm `Gắn` được item `26277431122`.
- Kiểm layout thật: desktop `1365px` có `scrollWidth=1350`, picker/result rộng `800px`; mobile `390x844` có `scrollWidth=375`, không tràn ngang.

### Trạng thái vận hành

- Shop có API: tiếp tục dùng catalog API/knowledge đúng shop và chỉ hiện link/nút `Gắn` khi có sản phẩm của shop đó.
- Shop không API: Chrome/local helper đồng bộ sản phẩm qua `/api/sync-variations`, Worker sẽ lưu catalog riêng đúng shop để picker video đọc lại; không mượn dữ liệu shop khác.
- Đang tách tiếp: `video-dashboard.js`, `routes/video.js`, `routes/products.js` vẫn còn lớn; Phase này chỉ tách lát đa shop/catalog trước để giảm rủi ro production.

## 2026-05-12 - Bổ sung Lazada live proof cho Shopee Profile Verification

### Code đã cập nhật

- `apps/fe/pages/shopee-review.html`: đổi trang reviewer từ Shopee-only sang màn chứng minh `Lazada live + Shopee pending`, thêm khối `Lazada live module cho Profile Verification`.
- `apps/fe/js/shopee-review.js`: đọc capability Lazada, chọn shop Lazada API live, đọc library Lazada đã lưu và gọi GET quota Lazada để chứng minh tích hợp live; không gọi thao tác ghi lên sàn.
- `apps/fe/css/shopee-review.css`: thêm layout proof card/table cho Lazada, giữ mobile-first và không tràn ngang.
- Thêm comment `NEO:` trong JS để đánh dấu lệnh GET Lazada dùng cho kiểm duyệt, không tạo/sửa/xóa dữ liệu sàn.

### Deploy và kiểm production

- `node --check apps/fe/js/shopee-review.js` pass.
- `git diff --check` cho `shopee-review.html/js/css` pass.
- Deploy Frontend version `52e3c5c8-3038-4793-8f58-c5f85bb65f37`.
- Mở production `https://shophuyvan-analytics.nghiemchihuy.workers.dev/pages/shopee-review.html?verify=shopee-review-lazada-20260512a` bằng Chrome profile kiểm thử production.
- Asset production đúng cache `shopee-review-lazada-20260512a`.
- UI hiển thị `Trang kiểm duyệt tích hợp Lazada và Shopee`.
- Lazada proof production: `1/1 shop có API sống`, shop `kinhdoanhonlinegiasoc@gmail.com`, seller/API id `200166591213`, quota endpoint phản hồi OK.
- Shopee proof vẫn giữ: `2/4 shop có API sống`, `chihuy1984` đã test Shopee Video API OK, thư viện Shopee video `311` video cache, queue Shopee `4` job.
- Layout desktop `1365px`: `scrollWidth=1350`; mobile `390x844`: `scrollWidth=375`, không tràn ngang.

### Trạng thái vận hành

- Dùng URL review này trong form Go Live để Shopee thấy sản phẩm OMS đã live với Lazada API và đang xin thêm Shopee Open Platform.
- Reviewer vẫn chỉ đọc: trang chỉ gọi GET để hiển thị capability/cache/quota; các thao tác ghi vẫn bị role reviewer và auth guard chặn.

## 2026-05-13 - Refactor Chat sàn theo tính năng và sửa lỗi gửi/sản phẩm/đơn tham chiếu

### Lỗi/root cause tìm thấy

- Cấu trúc chat đang bị tách cơ học thành `part-*.js` ở cả frontend và backend, khó grep theo tính năng và dễ nhầm vì frontend/backend đều có tên file chung.
- Route gửi chat production lỗi `assessChatContent is not defined` do module guard chưa đưa hàm kiểm nội dung vào phạm vi global mà module gửi đang dùng.
- Tab `Sản phẩm` có thể báo `Failed to fetch` rồi để panel trắng dù OMS đã có catalog đúng shop; cần fallback đọc catalog đã lưu, không mượn dữ liệu shop khác.
- Tab `Đơn hàng` nếu chưa khớp được đơn theo hội thoại thì không hiện dữ liệu tham chiếu cùng shop, làm CSKH tưởng shop không có đơn/sản phẩm.

### Code đã cập nhật

- Frontend chat đổi sang `apps/fe/js/dashboard/fe-chat-marketplace-loader.js` và các module `apps/fe/js/dashboard/fe-chat-marketplace/fe-chat-*`.
- Backend chat đổi sang `apps/worker-api/src/routes/worker-chat-marketplace-route.js` và các module `apps/worker-api/src/routes/worker-chat-marketplace/worker-chat-*`.
- Đã cập nhật import từ `apps/worker-api/src/index.js`, `api-sync.js`, `orders.js`, `marketplace-webhooks.js`, `product-catalog-core.js`, `product-knowledge-sync-core.js`, và script production của `chat-marketplace.html`/`profit-dashboard.html`.
- `worker-chat-06-guard-policy.js` export thêm `assessChatContent` và `assessAiPolicy` vào global để `worker-chat-33-send-reply-dispatch.js` dùng khi dry-run/gửi thật.
- `worker-chat-10-context-panel.js` trả thêm `reference_orders` cùng `platform + shop` khi chưa có hard/soft match; UI hiển thị nhóm `Đơn tham chiếu cùng shop`.
- `fe-chat-16-context-media-guard-send.js` khi đồng bộ sản phẩm lỗi sẽ gọi fallback `/api/chat/products` cho đúng hội thoại/shop và báo rõ đang dùng catalog OMS đã lưu.
- Đã tạo skill `shophuyvan-chat-maintenance` để lần sau trước khi sửa chat phải kiểm file quá `30KB`, tên trùng frontend/backend, tên `part-*`, và luồng API/non-API.

### Trạng thái vận hành

- Shop có API: tiếp tục đồng bộ sản phẩm qua API; nếu API/token lỗi thì UI dùng catalog OMS đã lưu đúng shop và báo lỗi đồng bộ rõ ràng.
- Shop không API: chỉ đọc dữ liệu OMS/import/browser helper đã lưu đúng shop; không gắn nhãn đồng bộ API và không lấy catalog/đơn từ shop khác.
- Đang khóa: không gửi chat live trong kiểm thử nếu chưa có xác nhận câu test; chỉ dùng `dry_run` cho route gửi.

### Kiểm tra và deploy production

- `node --check` pass cho toàn bộ `apps/fe/js/dashboard/fe-chat-marketplace/*.js`, loader `fe-chat-marketplace-loader.js`, wrapper `worker-chat-marketplace-route.js`, `worker-chat-*` và các import liên quan.
- Kiểm cấu trúc chat: không còn file `part-*.js` trong `apps/fe`/`apps/worker-api/src`, không có tên file trùng giữa frontend/backend chat, và toàn bộ file chat hiện hành dưới `30KB`.
- Deploy Worker version cuối: `24e60b3b-d2b9-4825-b95f-31c0c0c669ca`.
- Deploy Frontend version cuối: `64e6262d-7a4a-4368-9a9b-d44c153043fb`, asset chat chạy cache `fe-chat-marketplace-20260513f`.
- API production `POST /api/chat/send` với `dry_run=true` cho hội thoại `131492` trả 200, không còn lỗi `assessChatContent is not defined`.
- API production `/api/chat/context?id=131492` đã giảm còn khoảng `77KB`, trả `reference_orders=5`, `product_catalog=8`, `product_catalog_index=80`, tránh lỗi Chrome `Failed to fetch` do payload context quá lớn.
- Mở production bằng Chrome profile `ProductionAdminTest`: trang Chat sàn load `60` hội thoại, loader đúng `20260513f`, console/network không có lỗi `/api/chat`, `/api/products` hoặc asset `fe-chat-*`.
- Hội thoại API `hanhmupmup/chihuy1984`: tab `Sản phẩm` hiện catalog đúng shop, bấm `Đồng bộ sản phẩm` thật trả `Đã đồng bộ 87 sản phẩm · 152 phân loại cho chihuy1984`, không còn `Failed to fetch`; tab `Đơn hàng` hiện `5` đơn tham chiếu cùng shop.
- Hội thoại shop không API `chaunguyen261/khogiadungcona`: tab `Đơn hàng` hiện `1` đơn khớp mềm cần kiểm tra; tab `Sản phẩm` hiện dữ liệu OMS đúng shop, nút đồng bộ API bị khóa vì shop chưa có token API sản phẩm hợp lệ.
- UI production không còn render dòng `NEO:` trong thẻ đơn/sản phẩm; backend và frontend đều lọc dữ liệu bẩn kiểu `// NEO:` trước khi hiển thị cho CSKH.

## 2026-05-13 - Mở ghi thật Shopee Voucher/Bundle/Add-On/Flash Sale, sửa chat và video center

### Code đã cập nhật

- Shopee promotion thêm route ghi thật `/api/discounts/shopee/promotion-action` cho `voucher`, `bundle_deal`, `add_on_deal`, `shop_flash_sale`; mọi lệnh ghi bắt buộc preview, quyền admin, chuỗi xác nhận `TOI_HIEU_DAY_LA_THAY_DOI_GIA_SHOPEE` và log action.
- ADS Discount thêm lọc theo shop, tồn kho, doanh thu; modal có nút preview/tắt khuyến mãi trên Shopee thay vì chỉ khóa thao tác.
- Tab `Khuyến mãi sàn` thêm tick từng dòng, `Tích all`, preview kết thúc/xóa, xóa hàng loạt trên Shopee, và form tạo Flash Sale theo giờ bật/tắt.
- Chat sàn đổi toàn bộ module frontend/backend từ tên số kiểu `fe-chat-15-*` sang tên ngữ nghĩa; tab sản phẩm đổi nút sang `Chèn thẻ SP`, gửi `message_type=product_card` thay vì chèn link.
- Chat API sync truyền thêm `buyer_id/buyer_name` vào Shopee active sync để tránh mất đồng bộ tin nhắn theo hội thoại đang mở.
- Video center sửa init tab để chunk tải xong sau `DOMContentLoaded` vẫn gắn sự kiện; backend video dashboard bổ sung migration cột snapshot và import `normalizeOverview` để endpoint không còn HTTP 500/CORS.
- Đã xuất file cấu trúc + dung lượng: `docs/file-structure-kb-2026-05-13-promotion-chat-video.txt`.

### Deploy và kiểm production thật

- Worker deploy cuối: `3f1a244a-8105-4d2e-ba50-80926f7dd631`.
- Frontend deploy cuối: `3648cbb5-12aa-4332-8697-fa2f3d1e9fd6`.
- `node --check` pass cho toàn bộ file ADS/chat/promotion/video liên quan; file trong phạm vi đợt này đều dưới `30KB`.
- Production dry-run `/api/discounts/shopee/promotion-action` trả đúng endpoint Shopee cho Voucher `end_voucher` và Flash Sale `delete_shop_flash_sale`, `dry_run=true`, không gửi lên sàn.
- Production ADS mở bản `ads-promotion-live-20260513b`: Discount có lọc tồn/doanh thu và action tắt KM; Flash Sale hiển thị toolbar tick/xóa, form giờ bật/tắt, payload item và nút tạo trên Shopee.
- Production Chat mở bản `fe-chat-marketplace-20260513g`: không còn asset `fe-chat-xx`/`worker-chat-xx`, tab sản phẩm hiển thị `Item Shopee` và nút `Chèn thẻ SP`, không còn nút `Chèn link`.
- Production Video mở bản `video-tab-init-20260513a`: bấm chuyển tab `Kho video đóng gói` thành công; API `/api/video/dashboard` trả `200 OK` và có CORS.
- Mobile 390px kiểm `ads.html`, `chat-marketplace.html`, `dashboard_video.html`: `scrollWidth=390`, không tràn ngang.

### Trạng thái vận hành

- Shop Shopee có API: có thể preview/gửi thật Voucher/Bundle/Add-On/Flash Sale qua API với guard admin + xác nhận; Flash Sale theo giờ gửi payload từ UI.
- Shop không API: không gọi Open Platform; chỉ dùng cache/OMS/browser helper có log, không gắn nhãn đồng bộ API.
- Lazada promotion ghi thật vẫn khóa an toàn; hiện chỉ giữ read-only/snapshot cho Voucher/Freeship/Flexicombo.
### 2026-05-14 - Repo cleanup, runtime split, and 30KB guard

- Tách Python local automation khỏi repo chính sang `E:\shophuyvan-python-automation`; repo chỉ giữ tài liệu liên kết `docs/python-automation.md` và script khởi động đọc `SHOPHUYVAN_PYTHON_AUTOMATION_DIR`.
- Tách runtime/log/cache/PDF/XLSX/video/debug payload sang `E:\shophuyvan-runtime`; repo chính không còn `auto OMS Python`, `Phieu_In_PDF`, file log/PDF/XLSX/cache đơn hàng/debug payload thật.
- Code-size guard đã chuyển sang fail trên `>30KB`, warning trên `>28KB`, bỏ qua runtime/artifact và chỉ scan source `.js/.mjs/.py/.html/.css/.ts`.
- Đã refactor các file web/worker lớn thành module nhỏ hơn 30KB: `index.js`, ADS, Returns, Reviews, Top Picks, Product Catalog, Marketplace Push, OMS label/logistics/render, các HTML lớn và admin variation/invoice.
- Tool `switch github` chưa xác minh là source deploy nên chuyển vào `_cleanup_quarantine/2026-05-14/switch github` thay vì xóa.

### 2026-05-14 - Bổ sung sau kiểm runtime Python

- Python local profile Chrome đã chặn quay lại repo cũ: `profile_paths.py` remap path `auto OMS Python`/hybrid sang `E:\shophuyvan-python-automation\profiles\browser`; Radar/helper đã restart và không còn process trỏ về repo cũ.
- `temp_print_jobs*.json`, cache đơn hàng, PDF tem, video tạm và debug payload của Python local chuyển sang `E:\shophuyvan-runtime` qua `runtime_paths.py`.

## 2026-05-14 - Sửa kéo đơn API và fallback polling realtime

### Lỗi/root cause tìm thấy

- Luồng Shopee/Lazada order sync gọi API bằng access token cũ trực tiếp, không đi qua helper refresh token theo từng shop, nên shop có API nhưng token access hết hạn có thể không kéo được đơn.
- Sau refactor module, `buildShopeeImportPayload()` và `buildLazadaImportPayload()` dùng `feeDetailToPayload()` nhưng chưa bind lại từ `core`, làm production diagnostic báo `feeDetailToPayload is not defined` và order sync lỗi.
- Một số catch trong sync trạng thái chỉ `console.error` rồi trả kết quả rỗng, khiến UI không thấy lỗi thật. Cron realtime cũng quét nhiều sàn trong một lượt, có thể vượt quota subrequest và làm Lazada bị `partial_error`.

### Code đã cập nhật

- Shopee order sync dùng `fetchShopeeShopJson()` cho `get_order_list`, `get_order_detail`, tracking và escrow detail để refresh token tự động theo shop.
- Lazada order/status sync dùng `callLazadaWithShop()` cho `/orders/get`, `/order/items/get`, `/seller/get`, `/logistic/order/trace`.
- Thêm module `apps/worker-api/src/modules/api-sync/sync-diagnostics.js` để ghi diagnostic an toàn vào `shops` mà không log token đầy đủ.
- FE shop API status hiển thị `Kéo đơn`, `Trạng thái`, `Webhook`, `Realtime`, `last sync error`; nút `Đơn API` báo lỗi thật nếu sync fail.
- OMS `Quét trạng thái` giảm batch và tách Shopee/Lazada để tránh một lượt quá nặng; cron realtime chỉ chạy một sàn mỗi lượt, TikTok chưa có shop API nên không đi polling API.
- Tách inline CSS/JS lớn ra asset riêng và nâng `scripts/check-fe-separation.mjs` để kiểm thêm import JS cục bộ bị gãy.

### Deploy và kiểm production

- Worker production cuối: `6968a6dc-b246-4d0f-b30a-247080cc810c`.
- Frontend production cuối: `890e5a93-6333-4ec1-acb5-fd30dd4ee9b3`.
- D1 migration `docs/migrations/001_refactor_api_sync_realtime_indexes.sql` đã chạy remote: `47` query, DB sau migrate `212.19MB`, không có drop/copy dữ liệu.
- Production API smoke:
  - Shopee order sync: `status=ok`, `fetched=3`, `imported_orders=3`, không warning/error.
  - Shopee status sync: `status=ok`, `checked=3`, không warning/error.
  - Lazada order sync: `status=ok`, `fetched=1`, `imported_orders=1`, không warning/error.
  - Lazada status sync: `status=ok`, `checked=1`, `updated=1`, không warning/error.
- `/api/shops/api-configs` sau smoke: Shopee API shops và Lazada API shop đều `token_status=valid`, `refresh_token_status=valid`, `last_order_sync_status=ok`, `last_order_status_sync_status=ok`; shop không API vẫn `manual_or_browser`.
- UI production bằng profile `ProductionAdminTest`: tab `Kết nối API` hiển thị `KÉO ĐƠN OK`, `TRẠNG THÁI OK`, `WEBHOOK Chưa thấy`, `REALTIME Fallback polling`. Các trang `admin-products`, `oms-dashboard`, `sku`, `ads`, `reviews`, `profit-dashboard`, `dashboard_video`, `report-upload`, `admin-purchase` đều load không bị login.

### Trạng thái vận hành

- Shop có API: Shopee/Lazada kéo đơn và đối soát trạng thái bằng API chính thức, token được refresh theo shop, lỗi sync lưu vào diagnostic và hiện trên UI.
- Shop có API còn thiếu realtime push thật khi sàn chưa có webhook event/subscription hoạt động; hiện trạng thái rõ là `Fallback polling`.
- Shop không API: không gọi Open Platform, không gắn nhãn API; vẫn đi import/browser/Radar có kiểm soát.
- Rủi ro còn lại: `admin-purchase` vẫn có layout rộng `980px` trên mobile smoke, cần tách CSS/layout riêng ở phase UI sau.

