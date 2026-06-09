# Warehouse Core Map

## Product Core search tên dài cho Chat AI 2026-05-28

- Luồng chuẩn giữ nguyên: Chat Worker AI -> Worker chính `/api/core/products/search` -> Product Master/Warehouse snapshot -> Gemini context. Chat Worker không vá prompt/UI để che lỗi Product Core.
- `searchCoreProducts()` đã tách sang `apps/worker-api/src/core/products/core-product-read-core.js`; Shop summary dùng `apps/worker-api/src/core/shared-data/shop-core-data.js`; `core-data-core.js` chỉ còn Order/shared read và dưới 30KB.
- Search tên dài không còn dùng một pattern LIKE lớn; Core tách token an toàn và nếu có mã/SKU như `K75` thì ưu tiên token đó. Production query Lazada dài trả `matched_product_core`, SKU K75 và không còn `worker_unhandled_error`.
- Chat AI dry-run hội thoại Lazada đã hết `core_context_warnings`; auto-send vẫn giữ guard theo intent/policy, không gửi khi câu hỏi chưa rõ.

## Chat AI phase 2/3/4 2026-05-28

- Luồng chuẩn sau phase 2/3/4: Chat Core conversation/message -> AI Context Builder -> Worker Core read endpoints -> Gemini prompt sạch -> auto-simple policy -> gửi tự động hoặc chuyển duyệt.
- `CHAT_AI_MODE=auto_simple` không có nghĩa là gửi mọi câu: chỉ câu hỏi đơn hàng/sản phẩm đơn giản, có dữ liệu Core đủ, không warning/risk, policy approved và capability live-send mới được gửi.
- Evidence dùng cho audit nằm ở `ai_suggestions.prompt_context`, gồm count đơn/sản phẩm, mã đơn, truy vấn sản phẩm, cảnh báo thiếu dữ liệu và risk flags. UI chỉ render tóm tắt nghiệp vụ, không render raw/debug.
- Learning flow đi qua Chat Core: nhân viên duyệt/gửi câu AI -> `ai_knowledge_base`; hủy học -> `ai_suggestions.final_state=rejected`.
- Production: Chat Worker `62809e20-a2d0-4f1f-a407-2c4212eb6ca9`, static `a5848a8b-1b3e-45da-b8dc-c6af772695ac`; UI desktop/tablet/mobile pass.

## Chat AI Context Builder 2026-05-28

- Luồng chuẩn: Chat Core conversation/message -> AI Context Builder -> Worker Core read endpoints -> Gemini prompt sạch -> policy guard -> draft/suggest-only.
- Chat Worker không đọc raw Order/Product DB và không tự map trạng thái/giá/tồn; chỉ gọi `GET /api/core/orders/:orderId`, `GET /api/core/orders/by-conversation/:conversationId`, `GET /api/core/products/by-sku/:sku`, `GET /api/core/products/search`.
- Context đưa vào prompt chỉ gồm dữ liệu vận hành an toàn: mã đơn, trạng thái, vận chuyển, thanh toán, item/SKU, tên sản phẩm, giá, tồn và cảnh báo thiếu dữ liệu. Không đưa cost/raw payload/technical response.
- `CHAT_AI_MODE=suggest_only` đang khóa phase này: kể cả shop có `send_capability=bridge`, auto-reply cron chỉ tạo draft/needs_review, không tự gửi.
- Production readback Chat Worker `6021d457-6ab8-431a-9497-a057192f6fcc`: hội thoại Lazada thật có `order_count=1`, `product_count=3`, `auto_send=false`.
- Đã xử lý tiếp: Product Core search tên dài đã hết `worker_unhandled_error` sau Worker chính `204213c9-6b18-4b49-8c73-50712e17ec4c`; SKU lookup vẫn pass và Chat AI không còn warning context cho case Lazada K75.

## Chat read-state lock 2026-05-27

- Luồng chuẩn: Shopee SellerChat bridge -> Chat Core merge/dedupe -> `chat_conversations.unread_count`/preview -> Chat UI render.
- Tin khách trùng từ polling không được tạo lại badge chưa đọc; tin lịch sử cũ không được ghi đè message cuối mới hơn.
- Production cleanup đã đặt lại `unread_count=0` cho `13` conversation có message cuối là shop; readback sau Sync lặp lại còn `0` answered conversation bị báo chưa đọc.

## Chat no-API scheduler + context 2026-05-27

- Chat no-API đi đúng luồng: Seller Center/browser helper/import -> Chat Core + Order/Product/Tracking Core -> Chat/CSKH chỉ render read-model.
- TikTok `0909128999` và Shopee no-API `khogiadungcona` chạy `sync_chat` theo scheduler local helper, headful/visible, đúng profile automation; shop API không dùng browser helper.
- Chat Core bổ sung repair `customer_name` từ message customer đã lưu và server search theo message text, `order_id`, attachment order-card để không kẹt ở 200 hội thoại local.
- Chat/CSKH tab `Đơn` đọc `/api/core/orders/by-conversation/*` và `/api/logistics-watch/detail`; tab `Sản phẩm` đọc dữ liệu item/Product Core từ order context. UI không tự suy luận order/product/tracking.
- Production verify order `584128214410102531`: customer `nguyn.xun.ha.63574`, sản phẩm `Kẹp Cố Định...`, SKU `10 KẸP SIZE 16MM TRẮNG K114`, ĐVVC `BEST Express`, mã vận đơn `TTVN1088367610`; desktop/tablet/mobile không tràn ngang.

## Chat sender và OMS order context 2026-05-27

- TikTok no-API đi `browser helper -> Chat Core`; phân loại người gửi được sửa ở Core trước khi UI hiển thị, không vá tên/loại câu ở từng màn hình.
- Order Shopee API `260527G4WW0496` đi `Order Core -> Chat context -> Product/Tracking Core`; production Chat panel hiện đúng item, SKU, vận chuyển và timeline từ Core.
- Nút `Nhắn khách` giữ đúng `customer_id`/`order_id` khi conversation chưa tồn tại; bản nháp xác nhận là UI state đọc từ Core template và chưa tự gửi.
- Product TikTok no-API không có card endpoint: UI chỉ chèn thông tin sản phẩm đã xác minh từ Product Core vào bản nháp gửi tay, không tạo nguồn dữ liệu hoặc trạng thái gửi giả.

## TikTok Finance Lock 2026-05-27

- TikTok Seller Center là nguồn chuẩn cho `product_revenue_after_shop_discount`, `estimated_income`, `actual_income`, `marketplace_fee_total`, `tax_total`, `sfr_service_fee/tiktok_sfr_fee` và `settlement_status`.
- `ADS ngoài ví` và `PiShip` lấy từ Cost Setting khi Seller Center không trả dòng ngoài ví, nhưng chỉ nằm ở nhóm `Phí vận hành / Cost setting` và tab `Lợi nhuận`.
- Không cộng `ADS ngoài ví` hoặc `PiShip` Cost Setting vào `platform_deduction_total`, `total_deductions`, `marketplace_fee_total`, `tax_total` hoặc `Tổng khấu trừ` của TikTok.
- Regression khóa ở `scripts/test-finance-taxonomy.mjs`, `scripts/test-tiktok-seller-center-finance.mjs`, `scripts/check-oms-core-regression-lock.mjs`.
- Production lock đã kiểm trên Worker `huyvan-worker-api` version `25ae3ebb-f598-4637-8b22-d692aa6b5b39`: đơn `584211305752462759` có `ads_fee_total=5500`, `piship_fee=2008`, `internal=7508`, `total_deductions=0`, `profit_real=11467`; OMS desktop/tablet/mobile hiển thị đúng và không tràn ngang.

## OMS order detail evidence 2026-05-27

- Sàn/API -> Worker API sync -> `orders_v2` và `order_tracking_core` -> OMS chỉ đọc read-model.
- `orders_v2.payment_method/payment_method_source` lưu phương thức thanh toán per-order từ Shopee `/api/v2/order/get_order_detail` hoặc Lazada `/orders/get`.
- `orders_v2.customer_note/customer_note_source` lưu ghi chú khách từ Shopee `message_to_seller` hoặc Lazada `buyer_note/remarks`.
- `order_tracking_core` lưu timeline vận chuyển từ Shopee `/api/v2/logistics/get_tracking_info` và Lazada `/logistic/order/trace`.
- Shop API không chuyển sang Seller Center/browser fallback khi chưa ghi rõ thiếu quyền/token; shop không API vẫn theo luồng manual/import/helper riêng.

## Tách ADS và Promotion Core 2026-05-24

- ADS quảng cáo không quản lý chương trình khuyến mãi. ADS chỉ đọc Promotion Core để tham chiếu hiệu quả: SKU đang khuyến mãi có ADS, lãi thấp, tồn thấp hoặc tồn cao nên đẩy ADS.
- Khuyến mãi sàn tách sang `apps/fe/pages/promotions.html`; UI đọc `/api/discounts/core` và `/api/discounts/promotion-module-read-model`.
- Promotion module read-model đọc các bảng chuẩn hiện có: `marketplace_discounts`, `marketplace_discount_items`, `marketplace_vouchers`, `marketplace_promotion_programs`, `marketplace_promotion_items`. Raw payload vẫn ở backend, UI chỉ render program/item/capability người dùng.
- 8 module vận hành bắt buộc trên UI: Shopee Discount, Shopee Voucher, Shopee Bundle, Shopee Add-On, Shopee Flash Sale, Lazada Voucher, Lazada Freeship, Lazada Flexicombo.
- Production đã deploy Worker `huyvan-worker-api` version `a637c316-4d53-4198-b20d-ae4f97fc9bf1` và static `shophuyvan-analytics` version `8d8cd111-f332-41f8-ba3e-2753f16963e5`; Chrome profile `E:\codex-chrome-profiles\shophuyvan-test` đã kiểm ADS/Khuyến mãi sàn desktop/tablet/mobile không tràn ngang.
- Live-write mới không được mở rộng nếu chưa có preview, admin confirm, quyền app, API response, readback từ sàn và action log. Module chưa đủ điều kiện phải hiển thị `Chỉ xem dữ liệu` hoặc `Cần kiểm quyền trước khi ghi`.

## ADS Core 2026-05-24

- ADS dữ liệu chuẩn đi theo luồng: Shopee/Lazada Ads API -> ADS Core -> UI ADS/OMS/Product/Dashboard chỉ đọc read model.
- ADS dùng `sku_current_cost_read_model.current_cost` từ Warehouse Core; `0` là dữ liệu thật, `null` là thiếu giá vốn.
- UI ADS không tự tính lãi sau ADS; lãi sau ADS đọc từ Finance Core/read model backend.
- Live-write ADS phải ghi `ads_action_logs`, cập nhật `ads_write_capabilities` và chỉ báo thành công khi readback từ sàn khớp.

Ngày cập nhật: 2026-05-20

## Cập nhật Purchase/Warehouse Core giá vốn theo lô 2026-05-24

- Bổ sung kho chung không tách shop cho trang nhập hàng: Product list dedupe theo `internal_sku/warehouse_sku`; UI không có filter/cột shop; `seller_sku/platform` chỉ là tham chiếu.
- Product Logistics Profile theo SKU nằm ở `product_logistics_profiles`, lưu một lần thông số đóng kiện mặc định: D/R/C, kg/kiện, khối/kiện, số SP/kiện mặc định, cách tính ship (`by_weight`, `by_volume`, `greater_of_weight_or_volume`, `fixed_per_package`, `manual`).
- Import shipment/purchase batch theo đợt nhập nằm ở `purchase_batches`; từng dòng SKU nằm ở `purchase_batch_items`; cost layer vẫn nằm ở `inventory_cost_layers` và nối về dòng bằng `purchase_batch_item_id`.
- Route đọc/ghi mới của Purchase Core: `GET/PATCH /api/purchase/logistics-profile`, `GET /api/purchase/import-batches`, `GET /api/purchase/import-batch`, `PATCH /api/purchase/batch-item-edit`, `GET /api/purchase/revisions`.
- Sửa dữ liệu nhập sai phải đi `PATCH /api/purchase/batch-item-edit`, bắt buộc `edit_reason`, lưu `purchase_batch_revisions`, tính lại `purchase_batches` totals, `inventory_cost_layers` và `sku_current_cost_read_model`.
- Trang “Quản lý nhập hàng chính ngạch” là nguồn nhập Purchase Core cho giá vốn theo từng lô; OMS/Product Master/Promotion chỉ đọc `current_cost` từ Warehouse Core, không tự tính lại ở UI.
- Bảng chuẩn mới: `purchase_batches` giữ thông tin lô, `purchase_batch_items` giữ từng SKU trong lô, `inventory_cost_layers` giữ tồn còn lại theo lô, `sku_current_cost_read_model` giữ giá vốn hiện tại của SKU.
- `landed_cost_per_unit` là giá vốn lô và không bị ghi đè bởi lô sau. `current_cost` là giá vốn hiện tại, tính bằng `weighted_average_remaining_stock` theo các cost layer còn tồn. `reference_cost` chỉ dùng đối chiếu/cảnh báo.
- Import Excel/Manual đều đi `preview -> confirm`; preview chỉ đọc Product Core và tính thử công thức, confirm mới ghi Purchase Core + Inventory Cost Layer + tính lại `sku_current_cost_read_model`.
- Production Worker version `4dc21f7f-e738-4fd4-b003-0ae1f39c120a`; static UI version `fd5f6bd6-6cbd-4e10-aa21-3578641ceb45`. Readback/preview/export/responsive pass; confirm ghi thật đang chờ dữ liệu lô nhập an toàn để tránh tạo giá vốn giả.

## Cập nhật Final Core module sync 2026-05-21

- `apps/worker-api/src/core/orders/read-core.js` tách health theo module cho OMS: `operation_sync_status`, `detail_sync_status`, `tracking_sync_status`, `finance_sync_status`, `label_sync_status`, `chat_sync_status` và các field finance health/source/error đi kèm. Một đơn đủ vận hành nhưng thiếu settlement không được rơi vào nhãn `Đủ dữ liệu`.
- Finance TikTok đã quét từ transaction drawer phải giữ source thật `tiktok_seller_center_finance_transaction`; fee popup/taxonomy coi fee bucket đã parse là khấu trừ TikTok đã quét, không trộn lại badge/fee cost setting. `cost_setting_fallback` vẫn là estimate, `finance_needs_resync=true`.
- Core chat target Lazada vẫn đọc session IM đã đồng bộ qua `GET /api/core/orders/:orderId/chat-target`; resolver phải chịu được trường hợp chưa có conversation row và trả reason/missing fields thay vì nổ route.

## Cập nhật profile map automation 2026-05-21

- Chrome automation tiếp tục ghi dữ liệu vào Order/Status/Finance/Label Core qua runner action riêng, không tạo nguồn dữ liệu thứ hai.
- Profile map chuẩn: `E:\shophuyvan-python-automation\oms_python\core\automation_profiles.py`; mỗi job phải lấy profile từ map này và log `platform`, `shop`, `action_type`, `chrome_profile_path`, lock nếu có.
- TikTok `0909128999` và Shopee no-API `khogiadungcona` là hai profile `automation_allowed=true`; Shopee/Lazada API shops là `automation_allowed=false`, `source=api`.
- Lazada API có profile manual mới `HuyVan_Bot_Data_lazada_kinhdoanhonlinegiasoc` để user đăng nhập/kiểm thủ công, không dùng thay Open Platform production.
- Profile Shopee API đã audit: Shop1 -> `phambich2312`, Shop2 -> `chihuy2309`, Shop3 -> probable `chihuy1984` nhưng cần login. Chưa rename khi Chrome còn đang giữ profile.

## Hotfix vận hành auto kéo đơn/trạng thái 2026-05-20

- Shop API tự đồng bộ nền bằng Worker/Cron/Webhook: Shopee `chihuy1984`, `chihuy2309`, `phambich2312` và Lazada `kinhdoanhonlinegiasoc@gmail.com` không cần user bấm `Kéo đơn`, không phụ thuộc Radar Python và không chạy Chrome.
- RADAR/local helper chỉ dành cho shop no-API/local fallback: Shopee `khogiadungcona`; TikTok `0909128999` được chạy auto theo scheduler nếu user bật và runner không paused, bằng batch nhỏ và profile automation riêng. Không dùng profile user cho automation.
- Modal `Tự động kéo đơn` hiển thị diagnostic thật: Radar process/PID/heartbeat, scheduler running, `auto_order_enabled`, `auto_status_enabled`, active window, `last_order_run_at`, `next_order_run_at`, `last_order_result`, `last_status_run_at`, `next_status_run_at`, `last_status_result`, `last_error`, `skipped_reason` và danh sách shop sẽ chạy.
- `Đánh thức ngay` ghi wake request vào runtime local `E:\shophuyvan-runtime\auto-order-scheduler\wake.json`, đánh thức Radar process nếu cần, buộc scheduler check cấu hình ngay và trả `woke`, `scheduler_running`, `immediate_check_result`, last/next/error thay vì chỉ ping `/health`.
- Cấu hình auto được lưu ở backend `/api/bot/settings` và snapshot local helper `E:\shophuyvan-runtime\auto-order-scheduler\config.json`; trạng thái scheduler ghi ở `status.json`. Khung giờ 06:00-20:00 hoặc giá trị user lưu được áp dụng theo giờ local máy chạy Radar.
- Worker cron API chạy batch nhỏ từ `apps/worker-api/src/index.js` theo `*/5 * * * *`, ghi diagnostic vào `shops.last_order_sync_*` và `shops.last_order_status_sync_*`; UI tính/hiển thị `next_sync_at` từ cron 5 phút. Cron lượt này không sync Payment live, không gửi push live và không tự queue Chrome fallback cho shop no-API.
- Lazada cron order/status dùng batch nhỏ hơn, tắt trace sâu trong lượt nền để không vượt giới hạn subrequest Cloudflare; nếu API trả lỗi thật thì diagnostic giữ nguyên `last_api_sync_error` để OMS thấy nguyên nhân thay vì chỉ báo Radar running.

## Hotfix production OMS theo hình 1-9 2026-05-20

- Lazada API shop `kinhdoanhonlinegiasoc@gmail.com`: chỉ `fee_source=lazada.finance.transaction.details.get` mới được coi là `actual_income`/settlement confirmed và được ghi `Lãi thực`. Nếu chỉ có Order API hoặc estimate từ cost setting thì read model/OMS phải ghi `Thiếu dữ liệu Finance API` hoặc `Lãi tạm tính`.
- Tracking Core là fallback đọc chung cho row và drawer: nếu `order_tracking_core.tracking_number` hoặc `tracking_events` đã có thì OMS không được hiện `Thiếu tracking`/`Chưa có tracking`. Timeline OMS tự dựng phải ghi `Timeline vận hành nội bộ`; timeline API phải ghi source Shopee/Lazada.
- Shop API có lỗi cũ `seller_center_detail_url_not_found`, `Seller Center URL detail` hoặc `api_shop_routed_to_seller_center` chỉ được xem là stale diagnostic, không làm `order_sync_completeness` thành `error` hoặc `Cần đồng bộ Seller Center`.
- Panel `Đồng bộ & tải lại` lấy shop từ `/api/core/shops` theo từng sàn, dùng dropdown và gửi `platform`, `shop_id`, `shop_key`; không gửi display text và không còn input gõ tay.

## Cụm vận hành OMS Đồng bộ & tải lại 2026-05-20

- Màn OMS mới nằm ở `apps/fe/js/modules/oms-resync-panel.js`, mở bằng nút `Đồng bộ & tải lại` trên `apps/fe/pages/oms-dashboard.html`. Panel có 3 tab: `Tải lại tem lỗi`, `Đồng bộ lại đơn`, `Trạng thái runner`.
- Tải lại tem lỗi dùng route `POST /api/label/retry-failed` (alias an toàn của `backfillEligibleLabels()`): bắt buộc chọn ngày/shop/sàn/trạng thái, hỗ trợ `dry_run`, `force`, batch `10/20/50`, nhưng vẫn giữ `max_subrequests_per_run=32` để không vượt budget Cloudflare.
- Candidate tem retry chỉ lấy đơn có `label_status=error`, `pending_retry`, `pending_document_generation`, `eligible/missing`, `label_eligible=true`, chưa có file tem hợp lệ, không cancel/return và shop/sàn có capability tải tem. `downloaded` chỉ retry khi bật `force`; `manual_required`, `not_supported`, `not_ready` bị bỏ qua rõ reason.
- Đồng bộ lại đơn không API dùng route `POST /api/orders/manual-sync/backfill`. TikTok mặc định shop `0909128999`, Shopee no-API mặc định `khogiadungcona`; payload có `from/to`, `platform`, `shop_id`, `sync_scope`, `missing_only`, `retry_failed`, `pending_settlement_only`, `missing_detail_url_only`, `dry_run`, `limit`.
- Route manual-sync bắt buộc có khoảng ngày hoặc mã đơn cụ thể để tránh quét toàn bộ. Shopee API shops `chihuy1984`, `chihuy2309`, `phambich2312`, `kinhdoanhonlinegiasoc@gmail.com` bị chặn Seller Center fallback bằng resolver và trả message `Shop API dùng Open Platform`.
- TikTok runner không còn bị khóa cứng manual-only bởi `codex_hotfix_final_pause`. Khi user bật auto và runner không paused, Radar được queue batch nhỏ an toàn qua local helper, dùng profile automation `E:\shophuyvan-python-automation\profiles\browser\shophuyvan-runner-tiktok`; nếu thiếu login/session phải trả `runner_requires_login` hoặc lỗi thật.
- Panel runner chỉ đọc/control local helper `GET /tiktok-runner/status`, `POST /pause|resume|stop`. `resume` trong tab trạng thái dùng `allow_run=false`; chỉ nút chạy thật mới gửi `allow_run=true`. Nếu profile chưa login thì hiện `Cần đăng nhập TikTok Seller Center cho profile automation`.
- Không gọi live message, Payment live, `ship_order`, `arrange`, `confirm`, `cancel`, RTS hoặc thao tác đổi trạng thái sàn. Lỗi dài giữ trong tooltip/diagnostic; dòng chính chỉ hiện message ngắn như `Sàn chưa trả file tem`, `Batch tải tem quá lớn`, `Chưa tìm được link chi tiết Seller Center`.

## Hotfix OMS source/label API 2026-05-20

- Nguồn quyết định theo Core mới nằm ở `apps/worker-api/src/core/orders/order-data-source-resolver.js`: Shopee API shops `chihuy1984`, `chihuy2309`, `phambich2312`, `kinhdoanhonlinegiasoc@gmail.com` luôn ưu tiên Open Platform API; Lazada API shop `kinhdoanhonlinegiasoc@gmail.com` luôn ưu tiên Lazada API; Shopee no-API `khogiadungcona` mới được dùng Seller Center fallback; TikTok `0909128999` là manual/local helper fallback.
- Với shop API, `seller_center_allowed=false` mặc định. Nếu API thiếu field/endpoint thì phải có `docs_checked=true` và `api_missing_reason` trước khi fallback; không được queue `seller_center_detail_url_not_found` hoặc ghi `Nguồn: Seller Center` cho `chihuy2309/chihuy1984/phambich2312`.
- Shopee shipping document flow đã đối chiếu Open Platform: `get_shipping_document_parameter` -> `create_shipping_document` -> `get_shipping_document_result` đến khi `READY` -> `download_shipping_document`. `create_shipping_document` được phân loại là `document_generation` để tạo chứng từ in/waybill, không phải fulfillment action.
- Fulfillment action vẫn bị cấm trong hotfix này: không gọi `ship_order`, arrange shipment, confirm, cancel, RTS hoặc bất kỳ endpoint đổi trạng thái đơn. Guard label chỉ bật `allowDocumentGenerate=true` trong flow tải tem Shopee API và luôn giữ `allowFulfillmentAction=false`.
- Lazada PrintAWB/package document dùng `/order/package/document/get` theo batch nhỏ, mặc định `8` đơn/lượt, tối đa `20`, `max_subrequests_per_run=32`. Khi gần giới hạn Cloudflare, runner ghi `pending_retry/lazada_batch_requeued`, đặt `next_retry_at` và lượt sau chạy tiếp.
- OMS row chỉ hiển thị lỗi ngắn: Shopee PDF chưa sẵn -> `Chưa có file tem, sẽ thử lại`; Lazada subrequest -> `Batch quá lớn, sẽ tự chia nhỏ`; lỗi kỹ thuật dài giữ trong title/diagnostic, không phơi trực tiếp ở dòng đơn.

## Hotfix TikTok runner và automation browser safety 2026-05-20

- TikTok local runner không được dùng profile user `E:\codex-chrome-profiles\shophuyvan-test`; profile automation chuẩn là `E:\shophuyvan-python-automation\profiles\browser\shophuyvan-runner-tiktok`, remote debug port riêng `9331`.
- Shopee no-API Seller Center detail runner dùng profile automation riêng `E:\shophuyvan-python-automation\profiles\browser\HuyVan_Bot_Data_khogiadungcona`, remote debug port `9332`; profile user chỉ dùng kiểm UI/admin thủ công.
- Control TikTok runner nằm trong local helper `http://127.0.0.1:8765/tiktok-runner/status|pause|resume|stop`; trạng thái runtime lưu ngoài repo tại `E:\shophuyvan-runtime\runner-control\tiktok\`.
- File runtime gồm `runner.lock.json`, `heartbeat.json`, `status.json`, `pause.json`, `stop.json`, `retries.json`; stop chỉ đóng PID Chrome đã nằm trong lock và có command line đúng profile automation.
- Status trả đủ alias vận hành `runner_state`, `chrome_profile`, `heartbeat`; `resume` mặc định chỉ kiểm API control và chỉ gỡ pause khi gọi kèm cờ cho phép chạy thật.
- Runner TikTok có cooldown `90s`, retry limit `3` lần/order, backoff từ `10 phút` tới tối đa `3 giờ`, ghi `next_retry_at`, không mở Chrome khi queue rỗng, đang pause, đang backoff hoặc có instance khác đang chạy.
- Admin shop diagnostic chỉ đọc local helper health, không tự bật `report_worker`, để hiển thị `TikTok automation`: đang chạy/tạm dừng/lỗi/không chạy, PID, Chrome profile, heartbeat, current order, queue pending/processing/failed, last error, next retry và pause reason.
- Cấm khôi phục `taskkill chrome.exe`, `Stop-Process` theo tên/profile chung, dùng profile user cho runner nền, hoặc dùng lại profile TikTok bot cũ không kiểm soát. Nếu profile automation chưa login TikTok Seller Center thì trạng thái phải là `runner_requires_login` hoặc `paused_requires_login`.

## Cleanup khóa vận hành status/detail/label 2026-05-20

- Runtime chuẩn vẫn là Order Warehouse/Core: status sync đi qua `autoSyncOrderStatuses()` và read model; Seller Center detail đi qua route `/api/orders/shopee-seller-detail/*`; auto label đi qua `backfillEligibleLabels()` và `POST /api/label/backfill-eligible`.
- Legacy `POST /api/labels/refresh/*` chỉ còn wrapper `410 legacy_label_refresh_route_disabled`; frontend không còn caller route này. Route chuẩn một đơn vẫn là `POST /api/label/:orderId/refresh`.
- Shopee label Worker đã cắt hẳn nhánh runtime tạo chứng từ: không còn endpoint `create_shipping_document`, không còn poll `get_shipping_document_result`, không còn cờ `allowCreate`. Shopee API chỉ gọi `logistics.download_shipping_document` cho document đã sẵn sàng.
- Local Shopee helper legacy bị khóa ở phần nhạy cảm: không còn gọi `create_shipping_document`, `get_shipping_document_result`, `ship_order`; selector `Chuẩn bị hàng / Sắp xếp / Xác nhận` bị làm rỗng. Job `refresh_label` cũ bị đánh fail với `legacy_refresh_label_disabled` để không chạy logic cũ.
- OMS hiển thị thêm diagnostic từ Core: `last_status_sync_at/status/error`, `detail_url_verified_at`, `detail_url_source`, `next_retry_at`, `label_status`, `last_label_download_at`, `last_label_error`. Admin shop status hiển thị thêm `Detail parser`, `Tem vận chuyển`, số `manual_required`, lỗi runner và retry.
- Guard mới: `scripts/test-legacy-flow-locks.mjs` chặn frontend gọi route cũ, chặn khôi phục endpoint create/ship trong label/status flow, chặn tự dựng URL Seller Center sai và bắt local helper từ chối job `refresh_label` legacy.
- Deploy cleanup: Worker chính `huyvan-worker-api` version `0a39c64b-1dcc-424f-a22d-e6748670493f`; static UI `shophuyvan-analytics` version `fcda023f-42df-4ed1-a0be-072f2e62033e`.

## Cập nhật realtime status, Seller Center detail và auto label 2026-05-19

- Trạng thái đơn realtime đi theo Order Warehouse/Core: marketplace/import raw status -> `mapMarketplaceOrderStatus()` -> `orders_v2.oms_status/shipping_status/order_type` -> `normalizeOrderReadModel()`. OMS/Dashboard/Export/Chat chỉ đọc `display_status_vi`, `fulfillment_status_core`, `terminal_status`, `label_eligible`, `label_status` từ read model, không tự map raw status.
- Runner tổng `autoSyncOrderStatuses` được triển khai bằng route `POST /api/orders/status/sync`, cron `scheduled()` và hook sau `importOrdersV2()`: Shopee API shops `chihuy1984`, `chihuy2309`, `phambich2312` dùng Shopee Open Platform; Lazada `kinhdoanhonlinegiasoc@gmail.com` dùng Lazada API; Shopee no-API `khogiadungcona` queue Seller Center detail fallback; TikTok `0909128999` queue Seller Center/local helper khi chưa có API order/token.
- Diagnostic status lưu trên `orders_v2`: `last_status_sync_at`, `last_status_sync_status`, `last_status_sync_error`, `status_source`, `status_changed_at`, `status_touched_24h`, `status_changed_count`, `next_retry_at`. OMS hiển thị nguồn `API / Seller Center / manual`, lần sync cuối, lỗi gần nhất và cảnh báo stale.
- Shopee Seller Center detail fallback nằm ở Worker route `/api/orders/shopee-seller-detail/eligible|queue|backfill|diagnostic` và local helper `E:\shophuyvan-python-automation\oms_python\platforms\shopee\orders\dongbochitiet.py` / `capnhattaichinh.py`. Parser chỉ đọc DOM/text bằng profile automation map `E:\shophuyvan-python-automation\profiles\browser\HuyVan_Bot_Data_khogiadungcona`, không bấm `Hủy`, `Xác nhận đơn`, `Sắp xếp vận chuyển`, `Giao hàng` hoặc `Thao tác khác`.
- Khi chỉ có `order_sn`, hệ thống không tự dựng `/portal/sale/order/<order_sn>`. Thứ tự resolve: đọc Warehouse field `seller_center_detail_id`, `seller_center_detail_url`, `seller_order_detail_id`, `source_url`, `raw_detail_url`; nếu chưa có thì mở Seller Center order list, tìm mã đơn, click đúng dòng, lấy URL `/portal/sale/order/<seller_center_internal_id>` và xác nhận mã đơn trên trang khớp trước khi ghi.
- Seller Center detail lưu `seller_center_detail_id`, `seller_center_detail_url`, `seller_order_detail_id`, `detail_url_source`, `detail_url_verified_at`, `source_detail=shopee_seller_center_detail`, trạng thái/tracking/ĐVVC vào `orders_v2`, item vào `order_items`, payment/finance nếu có vào `order_fee_details.raw_data.shopee_seller_center_detail`. Nếu thiếu thanh toán thì ghi `finance_detail_missing`/`needs_payment_section`, không fake `actual_income`.
- Auto tải tem thật chạy qua `backfillEligibleLabels()` và route `POST /api/label/backfill-eligible`/`retry-failed`, được gọi theo batch nhỏ. Shopee/Lazada API dùng Worker/Open Platform document route có guard; Shopee no-API/TikTok queue `retry_label` local runner; legacy `/api/labels/refresh/*` tiếp tục trả `410`.
- Shopee no-API `khogiadungcona` và TikTok/manual chỉ chuyển `label_status=manual_required` khi chưa có đường tải tem read-only đã xác nhận. Không gọi create/ship/arrange, không đổi trạng thái đơn trên sàn, không gửi tin live và không sync Payment live.
- Deploy/verify của lượt này: Worker chính `7a30c29b-acff-4299-90f0-5c474e849859`, static UI `2d08050e-f8c8-409e-a5fc-89f459d41119`. Production đã kiểm Shopee API, Lazada API, Shopee no-API Seller Center detail, TikTok fallback queue, label runner batch nhỏ, duplicate orders/items = `0`, và OMS desktop/tablet/mobile không tràn ngang.
- URL Seller Center mẫu `232855966247234` hiển thị mã đơn thật `260519RW5S0TA2` (không phải `260519RWS50TA2`), tracking `SPXVN067508201855`, ĐVVC `SPX Express`, status `Đã giao cho ĐVVC`; parser chặn mismatch với mã yêu cầu sai rồi backfill thành công khi dùng mã khớp trang.

## Cập nhật Order Status Core phase 2 và tải tem 2026-05-19

- Core chính giữ lại và mở rộng tại `apps/worker-api/src/core/orders/status-core.js`: `normalizeOrderStatusCore()` là read-model status chuẩn, `mapMarketplaceOrderStatus()` là entrypoint mapper Shopee/TikTok/Lazada/manual. Không tạo hệ mapper thứ hai.
- Read model chính tại `apps/worker-api/src/core/orders/read-core.js` trả đủ field chuẩn: `raw_platform_status`, `order_status_core`, `fulfillment_status_core`, `display_status_vi`, `order_type`, `terminal_status`, `label_eligible`, `label_status`, `label_reason`, `shipping_label_url`, `label_file_path`, `last_label_download_at`, `last_label_error`, `label_download_mode`, `label_download_supported`, `label_download_source`, `label_download_reason`, `label_download_read_only`, `label_download_requires_manual`.
- `/api/orders`, `/api/orders/changes`, `/api/core/orders/*`, Dashboard summary, Export và Chat order-link đọc status qua read model/Core. OMS frontend chỉ còn helper `apps/fe/js/dashboard/order-status-core.js` để format màu/icon từ Core, không tự dịch raw platform status.
- Mapper/helper cũ đã cắt hoặc hạ xuống wrapper: `mapShopeeStatus()` và `mapPlatformStatus()` chỉ gọi `mapMarketplaceOrderStatus()`; OMS `oms-render.js` và `oms-logistics-watch.js` không còn suy luận nghĩa từ raw `oms_status/shipping_status`; Chat order-link không fallback raw status để hiển thị.
- 45 đơn lệch `order_type=return` nhưng `oms_status/shipping_status=COMPLETED` được xử lý ở read model: Core trả `order_status_core=RETURN`, `display_status_vi=Hoàn / trả`, `terminal_status=true`. Lượt này không mutate/backfill dữ liệu thật, touched `0`, nên Finance `actual_income` confirmed không bị đụng.
- Label rule chuẩn: `downloaded` khi đã có `shipping_label_url` hoặc `label_file_path`; `eligible` khi capability read-only đủ và trạng thái đủ điều kiện; `not_ready` khi trạng thái chưa đủ hoặc đã terminal/unknown; `not_supported` khi platform chưa hỗ trợ; `manual_required` khi profile/capability chưa map; `error` khi có `last_label_error`.
- Capability tải tem đi qua `marketplace_shop_capability_core`: Shopee API shop bật `api_document_generation_then_download`; Shopee no-API `khogiadungcona` và TikTok `0909128999` bật `local_chrome_retry_label`; Lazada API shop bật `api_print_awb_read_only`; profile chưa map là `manual_required`; platform khác `not_supported`.
- Route label chuẩn: đọc `GET /api/labels/status`, dry-run/capability check hoặc tải thủ công một đơn bằng `POST /api/label/:orderId/refresh`. Legacy `POST /api/labels/refresh/*` trả `410 legacy_label_refresh_route_disabled`; caller frontend sai đã chuyển sang route chuẩn.
- `POST /api/label/:orderId/refresh` chỉ chạy khi `label_status=eligible`, `label_download_supported=true`, `label_download_read_only=true` và `label_download_requires_manual=false`. Shopee route không gọi `create_shipping_document`, `ship_order`, `mass_ship_order` hoặc arrange shipment; Lazada route chỉ đọc AWB/document. Nếu không đủ capability/trạng thái thì trả 409 và ghi reason.
- Auto tải tem thật/hàng loạt đã bật có kiểm soát qua `backfillEligibleLabels()` và `POST /api/label/backfill-eligible`; `bulk-oms-status`, import/status sync và cron chỉ gọi route chuẩn read-only theo batch nhỏ, không tạo job legacy `refresh_label`, không xác nhận/hủy/sắp xếp vận chuyển và không quét toàn bộ đơn mỗi cron.
- Deploy/verify capability tải tem: Worker chính `e0d7328f-cd5a-4708-b0cf-39a00503aee8`, static UI `5a3232bc-bd8d-456b-839a-22061d173ef4`; dry-run chỉ cho Shopee API order `label_status=eligible`, còn manual/TikTok/return/cancel bị chặn 409 đúng reason. Browser production bằng profile `E:\codex-chrome-profiles\shophuyvan-test` pass desktop/tablet/mobile, không còn nút bulk legacy.
- Deploy/verify production phase 2: Worker chính `badcbe4b-700f-4348-8af3-a6eed8babe8a`, static UI `fd77a0a3-e5b2-4bdb-a9ed-b691bf6563bd`; Chrome profile `E:\codex-chrome-profiles\shophuyvan-test` pass desktop `1366x900`, tablet `820x1180`, mobile `390x844`, các sample Shopee/TikTok/Lazada/manual/return đều đọc Core status đúng và không tràn ngang.
- Không gửi tin live, không sync Payment live, không gọi marketplace write/action nguy hiểm, không xác nhận/hủy/sắp xếp vận chuyển và không quét toàn bộ đơn mỗi cron trong lượt này.

## Cập nhật TikTok Seller Center detail finance 2026-05-19

- TikTok chưa có API order/token chính thức trong hệ thống, nên doanh thu/lãi đơn TikTok đi qua fallback read-only Seller Center detail/import/manual trước khi vào Warehouse/Core.
- Parser detail dùng URL `https://seller-vn.tiktok.com/order/detail?order_no=<ORDER_NO>&shop_region=VN`; `order_no` trên URL phải khớp mã đơn hiển thị trên trang, mismatch thì không import.
- Mapping nguồn: `Tổng cộng` -> `gross_revenue` / Tổng doanh thu báo cáo / Người mua thanh toán; `Tổng các mặt hàng sau khi giảm giá` hoặc `Tổng (các) mặt hàng sau khi giảm giá` -> `product_revenue_after_shop_discount` / Tiền sản phẩm sau KM shop; `Phí vận chuyển sau khi giảm giá` -> `buyer_shipping_paid`; `Số tiền bạn kiếm được` -> `actual_income_settlement` nếu có.
- Khi Seller Center thu gọn phần thanh toán, parser chỉ bấm `Hiển thị chi tiết` trong khối khách thanh toán để mở dòng tiền; không bấm `Hủy`, `In biên nhận`, `Thao tác khác` hoặc action marketplace.
- Khi chưa có `Số tiền bạn kiếm được`, Core đặt `actual_income=NULL`, `settlement_status=pending_settlement`, `finance_confidence=estimated`, `profit_status=estimated_pending_settlement`; lãi tạm tính dùng `profit_basis=product_revenue_after_shop_discount`, số tạm tính lưu ở `estimated_income` / `source_json`, không dùng `gross_revenue` và không cộng phí vận chuyển người mua trả.
- Dữ liệu detail lưu vào `order_fee_details.raw_data.tiktok_seller_center_detail` với source `tiktok_seller_center_detail`; `order_analytics.source_json.taxonomy` giữ mapping kỹ thuật -> tiếng Việt -> ý nghĩa nghiệp vụ.
- Runner/backfill an toàn: `/api/orders/tiktok-seller-detail/eligible`, `/queue`, `/backfill`, `/diagnostic` chỉ chọn batch nhỏ tối đa 20 đơn; không quét toàn bộ TikTok mỗi cron.
- Runner được queue sau `importOrdersV2()` khi kéo/import đơn TikTok mới và khi import trạng thái để đọc lại đơn pending settlement/chưa có Thực nhận ví. Local `report_worker` nhận `sync_detail`/`sync_finance`; manual CLI nằm ở `E:\shophuyvan-python-automation\oms_python\platforms\tiktok\orders\dongbochitiet.py` và `capnhattaichinh.py`.
- Không chỉ sửa parser: runner/backfill phải chạy để populate Warehouse, sau đó rebuild `order_analytics` với `sync_payment=false`.
- Guard 2026-05-19: nếu một đơn TikTok đã có `actual_income` confirmed từ `Số tiền bạn kiếm được`, lần runner sau không được hạ ngược về `NULL` khi trang tạm chưa hiện income; nếu detail vẫn pending thì chỉ giữ `estimated_income` và label `Lãi tạm tính`.

## Cập nhật Finance Taxonomy Guard 2026-05-19

- Taxonomy phí/doanh thu/lãi dùng chung cho OMS, Profit, Dashboard và Export: `Giá niêm yết`, `Giảm giá của shop`, `Người mua thanh toán`, `Sàn tài trợ / Voucher sàn`, `Phí sàn`, `Thuế / Khấu trừ`, `Phí ngoài sàn / Vận hành / Ads`, `Giá vốn`, `Thực nhận ví / Settlement`, `Lãi thực`.
- `shop_discount`/voucher shop là điều chỉnh doanh thu, không thuộc `Phí sàn` và không được nằm trong `marketplace_fee_total`.
- Công thức buyer-paid: `buyer_paid - cost - marketplace_fees - taxes - ops_ads_fees_not_in_settlement`; không trừ lại `shop_discount`.
- Công thức settlement: `actual_income - cost - ops_ads_fees_not_in_settlement`; không trừ lại phí/voucher đã nằm trong settlement.
- `finance_fee_core` trả `components` chỉ gồm phí/thuế/khấu trừ; voucher shop/voucher sàn nằm ở `discount_components`.
- OMS fee popup đổi sang click-to-open/pinned theo `order_id`, giữ khi re-render còn order và đóng khi order biến mất.
- Export thêm cột taxonomy rõ: giá niêm yết, giảm giá shop, buyer paid, voucher sàn, phí sàn, thuế/khấu trừ, ADS/vận hành, tổng khấu trừ, settlement và lãi thực.
- Lượt này không gọi marketplace action nguy hiểm, không gửi tin live và không sync Payment live.
- Deploy production: Worker chính `cc96348c-ebcb-441a-852e-03be377435eb`, static UI `1e47c9f4-14ab-48bc-9c16-406d42296b02`.
- Rebuild Finance Core production range `2026-05-18..2026-05-19` đã chạy `sync_payment=false`: `orders=88`, `saved=88`, snapshot `saved=10`.

## Cập nhật OMS mở Chat mới từ đơn hàng 2026-05-19

- OMS `Nhắn khách` đọc qua Warehouse/Core: order row -> `GET /api/core/orders/:orderId/chat-target` -> `Order Core + Shop Core`.
- Handler frontend mới nằm ở `apps/fe/js/modules/oms-chat-actions.js`, dùng hook `data-open-customer-chat`; không dùng `data-chat-order-open` hoặc `openOrderChatResolver()` legacy.
- Chat mới nhận deep-link tại `chat-cskh.html?source=oms&order_id=...`, resolve conversation qua Chat Worker mới nếu có, rồi tab `Đơn`/`Sản phẩm` đọc tiếp `/api/core/orders/by-conversation/*` và Product Core.
- Nếu không có conversation, Chat mới hiển thị order/product context và reason `Chưa có hội thoại`; nếu platform/shop không hỗ trợ thì OMS hiển thị reason như `Shop chưa bật Chat API`, `Lazada Chat API thiếu token/quyền IM`, hoặc `TikTok cần mở chat thủ công/local helper`.
- Worker chính `/api/chat/*` vẫn là 410 legacy guard; không restore `fe-chat-marketplace`, `chat-marketplace.html` hoặc `worker-chat-marketplace`.

## Cập nhật hotfix Sản phẩm trong Chat mới 2026-05-19

Phạm vi lượt này là khôi phục Product tab/card cho `chat-cskh.html` bằng Chat mới và Product Core, không hồi sinh Chat legacy.

- Frontend mới thêm tab `Sản phẩm` trong `apps/fe/pages/chat-cskh.html`; logic nằm ở `apps/fe/js/dashboard/chat/products.js`, dùng chung state/event với `apps/fe/js/dashboard/chat/order-link.js` và `events.js`.
- Tab `Sản phẩm` đọc tìm kiếm từ Product Master/Core qua `GET /api/core/products/search` và kiểm SKU qua `GET /api/core/products/by-sku/:sku`; không đọc `fe-chat-marketplace` và không đọc bảng Chat legacy.
- Sản phẩm liên quan trong hội thoại lấy từ Order context mới: `chat-cskh.html` -> `GET /api/core/orders/by-conversation/:conversationId` -> `orders_v2/order_items` enrich Product Master `products/product_variations`.
- Product Knowledge/Core vẫn là nguồn bổ sung cho item sàn: `marketplace_product_knowledge` chỉ được đọc qua Core search, không trở thành source riêng của Chat UI.
- Hành động `Gửi thẻ sản phẩm` đi qua Chat Worker mới: UI -> `POST /api/chat/product-cards/send` -> kiểm conversation trong Chat Core -> kiểm sản phẩm trong Product Core -> Shopee adapter -> Worker chính bridge `POST /api/internal/chat-bridge/shopee/messages/product-card`.
- Shopee chỉ bật nút khi conversation có capability `official_api` hoặc `bridge`, Shopee bridge đã cấu hình, và sản phẩm có `item_id/platform_item_id`; route hỗ trợ `dry_run` để kiểm không gửi live.
- Lazada, TikTok, Facebook/Zalo và shop manual/import không fake product card. UI/API trả reason rõ như `TikTok chưa có Chat/Product Card API trong hệ thống` hoặc `Shop manual/import không hỗ trợ gửi thẻ tự động`.
- Các file catalog/advisory legacy đã xóa (`fe-chat-product-catalog-modal.js`, `fe-chat-product-advisory-editor.js`, `fe-chat-order-product-context-panels.js`, `fe-chat-context-tab-product-advisory-status.js`, `fe-chat-order-product-actions.js`) chỉ được tham khảo từ git history; không restore vào runtime.
- Runtime vẫn giữ `apps/fe/js/dashboard/fe-chat-marketplace/*`, `chat-marketplace.html`, `worker-chat-marketplace/*` ở trạng thái xóa; Worker chính `/api/chat/*` legacy tiếp tục trả 410.
- Deploy/verify hotfix: Worker chính `huyvan-worker-api` version `3a8ad03b-a557-4d0c-a149-d60445665e2f`, Chat Worker `shophuyvan-chat-api` version `76fc53b2-e0df-4c8d-9f2b-d1e974a8c42b`, static UI `shophuyvan-analytics` version `54d8476a-bf9e-4a45-8a6e-49520110f49e`.
- Production API pass: Worker chính `/api/chat/context` và `/api/chat/conversations` vẫn `410 legacy_chat_route_disabled`; Chat Worker `/api/chat/health` `200`; `/api/core/products/by-sku/HV999K241300S` `200`; `/api/core/products/search` `200`; product-card Shopee dry-run pass `sent_to_platform=false`.
- Browser production bằng Chrome profile `E:\codex-chrome-profiles\shophuyvan-test`: desktop `1366x900`, tablet `820x1180`, mobile `390x844` thấy tab `Sản phẩm`, tìm `HV999K241300S`, nút gửi card Shopee đúng capability, manual shop disabled với reason, không tràn ngang, không load `fe-chat-marketplace`, không gửi live.

## Cập nhật xóa/cắt Chat legacy 2026-05-19

Phạm vi lượt này chỉ cắt hệ thống Chat cũ. Không làm lại Shop/Product/Order/Finance, không gửi tin live, không gọi marketplace action nguy hiểm và không xóa dữ liệu thật.

- Frontend legacy `apps/fe/pages/chat-marketplace.html`, `apps/fe/js/dashboard/chat-marketplace-page.js`, `apps/fe/js/dashboard/fe-chat-marketplace-loader.js` và toàn bộ `apps/fe/js/dashboard/fe-chat-marketplace/*` đã bị xóa khỏi repo/runtime. Các link điều hướng chuyển về `apps/fe/pages/chat-cskh.html`.
- OMS đã bỏ caller legacy `Nhắn khách` mở `/api/chat/resolve-order-conversation`; Chat mới tiếp tục đọc đơn bằng `/api/core/orders/by-conversation/*`.
- Service worker frontend không còn gọi `/api/chat/notifications/latest`; notification click mở trang Chat mới.
- Worker chính giữ `apps/worker-api/src/routes/marketplace-chat/index.js` chỉ để trả `410 legacy_chat_route_disabled` cho `/api/chat/*` cũ và nhận bridge nội bộ Chat mới.
- Bridge nội bộ còn giữ: `POST /api/internal/chat-bridge/shopee/sync` và `POST /api/internal/chat-bridge/shopee/messages/send` trong `apps/worker-api/src/routes/marketplace-chat/shopee-bridge.js`. Đây là bridge Chat mới, gọi SellerChat API chính thức, không ghi bảng Chat legacy và không map Shop/Product/Order/Finance đi vòng Core.
- Bridge đọc cũ `GET /api/internal/chat-bridge/shopee/conversations*` trả `410 legacy_bridge_read_disabled` để Chat Worker không đọc lại route list/messages legacy của Worker chính.
- Auth/disconnect Lazada Chat cũ trả 410 rõ ràng: `/api/auth/lazada/chat/url` và `/channels/lazada/chat/callback` trả `legacy_chat_auth_disabled`, `/api/shops/disconnect-chat-api` trả `legacy_chat_disconnect_disabled`.
- Product knowledge sync được tách khỏi Chat legacy sang `apps/worker-api/src/core/products/product-knowledge-core.js`; API sync Product không import `worker-chat-marketplace` nữa.
- Backend legacy đã xóa khỏi repo: `apps/worker-api/src/routes/worker-chat-marketplace/*` và `apps/worker-api/src/core/chat/*`.
- Trạng thái hiện tại: không còn runtime `fe-chat-marketplace`, không còn `/api/chat/*` legacy trên Worker chính ngoài 410, và Chat mới đọc Shop/Product/Order/Finance qua Core API.

Các mục lịch sử bên dưới có thể nhắc trạng thái "chưa xóa" của các lượt trước 2026-05-19; trạng thái hiện hành được chốt ở mục này.

Deploy/verify production của lượt Chat legacy cleanup:

- Worker chính `huyvan-worker-api`: `04e42159-a24d-49e9-9e6e-eaea13b7c59b`.
- Static UI `shophuyvan-analytics`: `8c3807de-197a-4daa-81e1-3eb1ac697990`.
- Chat Worker không deploy trong lượt này; `npm test` Chat Worker pass.
- Production `/api/chat/context`, `/api/chat/conversations` trên Worker chính trả `410 legacy_chat_route_disabled`; `/api/internal/chat-bridge/shopee/conversations` trả `410 legacy_bridge_read_disabled`.
- Chat mới `chat-cskh.html` pass Chrome profile `E:\codex-chrome-profiles\shophuyvan-test` ở desktop `1366x900`, tablet `820x1180`, mobile `390x844`; Network không load `fe-chat-marketplace`, không gọi `/api/chat/*` legacy Worker chính, không tràn ngang.
- Finance Core ngày `2026-05-18` vẫn `status=ok`, `orders=68`, `gross_revenue=7.624.224đ`; duplicate exact `order_items=0`.

## Cập nhật tổng vệ sinh runtime đọc dữ liệu 2026-05-19

Phạm vi lượt này chỉ là runtime đọc dữ liệu. Không làm lại Shop/Product/Order/Finance, không gửi tin live, không gọi marketplace action nguy hiểm và không xóa dữ liệu thật.

Deploy/verify lượt runtime cleanup:

- Worker chính `huyvan-worker-api`: `5758ca3f-b27d-4c73-bfc1-bbd1885e21f0`.
- Static UI `shophuyvan-analytics`: `697c6142-e9c4-465f-8beb-12b5923616d9`.
- Rebuild Finance Core ngày `2026-05-18` đã chạy `sync_payment=false`: `orders=68`, `saved=68`, daily snapshot `saved=6`.
- Production sau rebuild: Finance Core `status=ok`, `gross_revenue=7.624.224đ`; Dashboard `dashboard_finance_source=order_finance_core`.
- D1 guard sau deploy: duplicate exact `order_items=0`, duplicate `orders_v2=0`, missing `order_analytics=0`, orphan `order_analytics=0`.
- Browser production bằng profile `E:\codex-chrome-profiles\shophuyvan-test`: desktop `1366x900`, tablet `820x1180`, mobile `390x844` không tràn ngang; `profit-dashboard.html` không còn `tab-chat` và không nạp `fe-chat-marketplace-loader.js`.

| Luồng | Nguồn đọc sau cleanup | Legacy đã cắt | Legacy còn giữ và lý do |
|---|---|---|---|
| Chat/CSKH mới | Chat Worker đọc hội thoại; đơn/sản phẩm/shop đọc Worker chính qua `/api/core/orders/by-conversation/*`, `/api/core/products/by-sku/*`, `/api/core/shops`. | Xóa trang/loader/module Chat marketplace cũ khỏi frontend runtime. | Chỉ giữ bridge nội bộ Shopee mới trong `routes/marketplace-chat/shopee-bridge.js`; không giữ `fe-chat-marketplace` hoặc router legacy. |
| Chat legacy Worker chính | Không còn đọc dữ liệu vận hành qua `/api/chat/*` Worker chính. | Xóa `worker-chat-marketplace/*` và `core/chat/*`; `/api/chat/*` trả 410. | Product knowledge sync đã tách sang `core/products/product-knowledge-core.js`. |
| OMS | `/api/orders` là wrapper runtime chính, đọc `orders_v2/order_items/order_fee_details` rồi normalize bằng Order Core read model/status/fee core. | Không thêm formatter status/customer/payment/shipping riêng. | Không đổi sang `/api/core/orders/*` ngay vì `/api/orders` còn là contract public cho OMS list/detail/filter. |
| Dashboard/Profit | Doanh thu/lãi/phí đọc `loadOrderFinanceCore()` và `order_analytics`; KPI tổng và shop breakdown phải cùng nguồn khi Finance Core `status=ok`. | Không dùng lại helper tự tính fee/profit legacy cho KPI. | Khi Finance Core stale, route chỉ được fallback có marker stale rõ; không trộn tổng Core với breakdown legacy. |
| Export | Header/item đọc `orders_v2/order_items`; finance đọc `order_analytics` và xuất `finance_source`, `finance_confidence`. | Không tự phân bổ fee/profit từ cột legacy nếu `order_analytics` có dữ liệu. | Fallback `orders_v2_legacy_fallback` còn giữ khi thiếu analytics để export không giả confirmed. |
| Product | Product page và item enrich đọc Product Master `products/product_variations`; không tạo nguồn product riêng cho Chat/OMS. | Không dùng raw SKU/name/price/stock làm nguồn chính nếu Product Master có dữ liệu. | Same-SKU khác biến thể/tên/tiền/số lượng vẫn giữ, không merge khi chưa có rule chắc. |
| Auto scan diagnostic | Capability/mode đọc `marketplace_shop_capability_core`, `orders_v2.source_mode`, `shops.last_order_sync_*`. | Không gắn API cho shop không có token/order API. | TikTok `0909128999` vẫn là manual/reference label vận hành, không coi là Shopee/Lazada raw technical id. |

Route legacy giữ `410`:

- `POST /api/orders/archive-old`: giữ 410 để caller cũ thấy route đã bị khóa, không âm thầm mutate `orders_v2`.
- `GET /api/fix-shop-names`: giữ 410 để caller cũ thấy shop-name hard-code đã bị khóa; tên shop phải qua Shop Warehouse/Core.

Rule bắt buộc sau cleanup:

- Không dùng raw numeric `shop_id/api_shop_id` hoặc `Shopee <id>` làm display chính cho Shopee/Lazada.
- Không merge/xóa same-SKU nếu khác biến thể, tên, tiền hoặc số lượng.
- KPI tổng và breakdown Dashboard/Profit phải cùng Finance Core source; nếu stale thì báo stale/guard, không silently fallback số bẩn.

Deploy production của lượt Shop Warehouse guard:

- Worker chính `huyvan-worker-api`: `d8e7ae88-a31e-4e2c-8b71-3a95bb4872b3`.
- Chat Worker `shophuyvan-chat-api`: `ff2d5b00-9bdb-4f6e-be0f-9825a95875af`.
- Static UI `shophuyvan-analytics`: `06d47676-37f9-4a24-a704-646f67e683ae`.

## Luật gốc

Thiếu gì thì nhập vào Nhà Kho trước. Màn hình chỉ lấy từ Nhà Kho. Không vá màn hình, không tạo nguồn dữ liệu thứ hai.

## Scope audit lượt này

Shop Warehouse đã pass và Product Warehouse đã có Product Master. Lượt này không làm lại Shop/Product, không refactor Order ngoài phần Finance đang phụ thuộc. Trọng tâm là Finance Warehouse/Core cho Profit, Income, Dashboard và Export: route chuyên biệt được giữ chỉ khi là wrapper đọc Core, không tự dựng lại doanh thu/phí/lãi bằng công thức legacy.

## Shop Warehouse

Luồng chuẩn đã áp dụng:

Shopee Shop API chính thức
→ `normalizeShopProfile()`
→ `shop_core_profiles`
→ `/api/core/shops` và `/api/core/shops/:shopId/summary`
→ Chat/OMS/Product/Dashboard chỉ đọc `shop_display_name` từ Core API.

Endpoint chính thức đã xác minh:

- `GET /api/v2/shop/get_shop_info`: request query dùng `partner_id`, `timestamp`, `access_token`, `shop_id`, `sign`; response dùng `shop_name`, `region`, `status`.
- `GET /api/v2/shop/get_profile`: request query dùng `partner_id`, `timestamp`, `access_token`, `shop_id`, `sign`; response bổ sung `response.shop_name`, `response.shop_logo`, `response.description`.

Rule hiển thị:

- Nếu Shopee API trả tên hợp lệ: dùng `shop_display_name` từ `shop_core_profiles`, `shop_name_source=shopee_shop_api`.
- Nếu có manual alias hợp lệ và không phải raw id: dùng alias theo rule Warehouse.
- Nếu thiếu tên: dùng `Shop chưa đồng bộ tên`, `shop_name_missing=true`, UI hiện badge `Thiếu tên shop`.
- Raw numeric `shop_id` chỉ là technical id, không làm tên chính.

## Bản đồ luồng dữ liệu

| Luồng | Đã qua Warehouse chưa | File/helper/API đang dùng | Còn đi vòng ở đâu | Cần xoá/cắt | Ưu tiên |
|---|---|---|---|---|---|
| Chat/CSKH shop display | Có | `apps/chat-worker-api/src/core/shop-display-core.js`, `apps/worker-api/src/core/shared-data/core-data-core.js`, `/api/core/shops`, `apps/fe/js/dashboard/chat/render.js` | Không còn runtime `fe-chat-marketplace` | Xóa legacy page/loader/module | P0 pass |
| Chat/CSKH order/product/fee | Có | `apps/fe/js/dashboard/chat/order-link.js`, `/api/core/orders/by-conversation/*`, `/api/core/products/by-sku/*`, Finance Core/`order_analytics` khi cần tiền | `/api/chat/*` Worker chính trả 410, không còn context legacy | OMS caller legacy đã xóa; bridge mới không tự map order/product/finance | P0 pass |
| OMS shop/order/fee | Có qua Order Warehouse tables và fee/status core | `/api/orders`, `orders_v2`, `order_items`, `order_fee_details`, `status-workflow`, `fee-phase1-core` | OMS chưa chuyển toàn bộ sang `/api/core/*`, nhưng backend đang đọc Warehouse/Core tables | Không xoá route `/api/orders` vì còn runtime chính | P1 |
| Product page | Có qua Product Master | `/api/products`, `products`, `product_variations`, catalog/stock core | Product page đọc Product Master route trực tiếp, không phải bảng Chat riêng | Không làm lại Product; chỉ refactor nếu phát hiện duplicate source | P1 khóa Product |
| Dashboard | Có cho chỉ số doanh thu/lãi/phí chính | `/api/dashboard`, `order_finance_core`, `dashboard_finance_fee_core`, `order_analytics`, `order_fee_details`, ADS snapshots | Hủy/hoàn/status vẫn dùng route dashboard public trên `orders_v2` + status core | Không xoá `/api/dashboard` vì là runtime public; route chỉ enrich/format từ Core | P1 pass Finance |
| Profit/Finance | Có | `/api/order-analytics/finance-core`, `loadOrderFinanceCore()`, `order_analytics`, `marketplace_order_finance_daily_snapshots`, `/api/profit-by-day`, `/api/revenue-by-day` | Income realtime vẫn là source-acquisition/readback Payment/Finance, không phải báo cáo lịch sử thay Core | Đã cắt công thức Profit by day cũ; giữ Income route vì đọc API/snapshot nguồn | P1 pass Finance wrapper |
| Export | Có cho dữ liệu tài chính export | `orders/export-cost-stock.js`, `order_analytics`, `order_items`, `orders_v2` metadata, `finance_source`, `finance_confidence` | Nếu `order_analytics` chưa có row thì export gắn rõ `orders_v2_legacy_fallback`, không coi là confirmed | Đã cắt phân bổ fee/profit legacy trong export; chưa xoá `recalcCost` vì là write-path | P1 pass Finance wrapper |

## Order Warehouse/Core cleanup 2026-05-19

Shop Warehouse đã pass, Product Warehouse đã có Product Master, Finance Warehouse/Core đã pass cleanup và có guard `calc_version`. Lượt này chỉ xử lý Order Warehouse/Core; không làm lại Shop/Product/Finance, không gọi sync payment live và không gửi marketplace action.

Nguồn chuẩn Order hiện có:

- `orders_v2`: order header, shop/platform, trạng thái vận hành, buyer/customer, doanh thu import, tracking, source metadata.
- `order_items`: dòng sản phẩm của đơn; dùng cho OMS detail, export và Order Core item list.
- `order_fee_details`: chi tiết phí/settlement liên quan order; Order Core chỉ đọc lại, không tự tính phí mới.
- `order_analytics`: chỉ dùng khi luồng cần số Finance Core đã chuẩn hóa, không dùng để quyết định trạng thái đơn.
- `/api/core/orders/:orderId` và `/api/core/orders/by-conversation/:conversationId`: read API chuẩn cho Chat mới và các consumer cần Order Core contract.
- `apps/worker-api/src/core/orders/read-core.js`: helper chung mới cho display id, source marker, status label/kind/parent và `order_type` theo `order_status_core`.

## Order items duplicate legacy 2026-05-19

- Khóa canonical cho `order_items` khi chặn duplicate là `platform` từ `orders_v2` + `order_id` + `sku` + `variation_name` + `product_name` + `image_url` + `qty` + `revenue_line` + `cost_real` + `cost_invoice` + `original_price` + `sale_price` + `current_price` + `price_source` + `reservation_id`.
- Guard chống tái phát nằm ở `apps/worker-api/src/routes/orders/order-items-dedupe.js`, được gọi trong `importOrdersV2()` sau khi insert item và trước inventory movement. Guard chỉ xóa dòng trùng tuyệt đối trong cùng đơn, giữ row mới nhất theo `id DESC`, không xóa nhiều dòng cùng SKU nếu khác biến thể/tên/tiền/số lượng.
- Cleanup production đã backup vào `order_items_dedupe_backup_20260519` rồi xóa `18` dòng duplicate exact thuộc `14` nhóm trên `13` đơn Shopee, range `2026-05-02..2026-05-13`, shop `chihuy1984`, `chihuy2309`, `phambich2312`.
- Một nhóm cùng SKU nhưng khác dòng hàng thật (`2605102FQYD1TW`, sku `DAYVOISENTOTK231`) không xóa vì khác `variation_name`, `product_name`, `qty` và `revenue_line`.
- Ảnh hưởng trước cleanup: Product/Top SKU/Export/Profit theo sản phẩm bị nhân đôi vì `order_analytics` lấy item sum làm một phần revenue basis. Sau cleanup đã rebuild `order_analytics` cho range liên quan với `sync_payment=false`; Finance Core `status=ok`, exact duplicate count còn `0`.

Audit trước/sau:

| Luồng | Trước khi sửa | Sau khi sửa | Còn đi vòng | Legacy đã cắt | Ưu tiên |
|---|---|---|---|---|---|
| OMS order list | `/api/orders` đọc `orders_v2` + `order_items` + `order_fee_details`, tự trả status/source rải trong route | `/api/orders` vẫn giữ contract runtime nhưng enrich qua `normalizeOrderListRowForCore()` từ `read-core`, trả `platform_order_id`, `status_label_vi`, `status_kind`, `status_parent`, `order_status_core`, `source`, `confidence`, `badge`, `raw_source` | Không đổi sang `/api/core/*` để tránh phá runtime OMS; route hiện là wrapper Warehouse/Core | `/api/orders/archive-old` bị chặn 410, không còn update lịch sử cũ | P0 done |
| OMS order detail | Cùng payload `/api/orders`, item lấy từ `order_items`, phí qua `fee-phase1-core` | Cùng nguồn nhưng mỗi row có metadata Order Core chung | UI OMS còn render label riêng cho layout vận hành, không tự quyết định `order_type` | Không xoá `/api/orders` vì còn runtime chính | P1 |
| Chat order-link mới | `apps/fe/js/dashboard/chat/order-link.js` gọi `/api/core/orders/by-conversation/*` | Giữ nguyên hướng mới | Không còn `worker-chat-marketplace`; bridge Shopee mới nằm ở `marketplace-chat/shopee-bridge.js` | Xóa legacy Chat frontend/backend | P0 pass |
| Chat enrichment từ OMS | OMS không còn nút/caller `/api/chat/resolve-order-conversation` | Cắt caller cũ thay vì giữ bridge legacy | Không còn trang `chat-marketplace.html` | Route `/api/chat/resolve-order-conversation` trên Worker chính trả 410 chung | P0 pass |
| Dashboard order/status | `/api/dashboard` và `/api/cancel-stats` đọc `orders_v2` nhưng gom bằng `order_status_core`; Finance đọc `order_finance_core` | Không đổi code vì đã đúng Warehouse/Core: trạng thái từ `orders_v2` + core status, doanh thu/lãi từ Finance Core | Không có route dashboard tự tạo nguồn order thứ hai | Không đụng Finance guard | P1 pass |
| Export order | `/api/export-orders` đọc `orders_v2` metadata + `order_items`, số tài chính từ `order_analytics` khi có | Không đổi code vì đang là wrapper Warehouse/Finance Core và đã gắn `finance_source/confidence` | Fallback `orders_v2_legacy_fallback` còn tồn tại khi thiếu `order_analytics`, có marker rõ | Không xoá `recalcCost` vì là write-path bảo trì | P1 pass |

Legacy Order đã cắt khỏi runtime:

- `POST /api/orders/archive-old`: trước đây cập nhật hàng loạt `orders_v2`, thậm chí ép đơn `PENDING` cũ thành `COMPLETED`; hiện trả `410 legacy_order_archive_old_disabled`.
- `GET /api/fix-shop-names`: trước đây update shop bằng mapping hard-code; hiện trả `410 legacy_fix_shop_names_disabled`, Shop display phải qua Shop Warehouse/Core.

Legacy chưa xoá vì chưa chắc:

- `POST /api/orders/bulk-delete`: vẫn là tool bảo trì xoá đơn lỗi có chủ đích, chưa có replacement Core tương đương.
- `GET /api/orders/debug-status`: read-only để audit trạng thái trong DB.
- `recalcCost()` trong `orders/export-cost-stock.js`: write-path bảo trì cost/profit cũ, không phải read-path Order Core.
- Legacy Chat marketplace: user xác nhận Chat đang dùng hướng mới; không refactor/xoá trong lượt Order cleanup này vì docs vẫn đánh dấu còn bridge/readback/media dependency.

## Order auto scan và Finance reconcile 2026-05-19

Mục tiêu hẹp: không làm lại Shop/Product/Order/Finance, chỉ chốt lại luồng quét đơn đúng theo capability và xử lý mismatch Finance ngày `2026-05-18`.

- Cron Worker chính nằm ở `apps/worker-api/src/index.js`; trigger deploy trong `apps/worker-api/wrangler.toml` là `*/5 * * * *` và `0 0 * * *`.
- Cron realtime chỉ polling API cho `shopee` và `lazada`, mỗi tick chọn một sàn để giảm subrequest; TikTok không có order API/token chính thức trong hệ thống nên không đưa vào polling API.
- Shopee endpoint đơn chính thức đang dùng: `/api/v2/order/get_order_list` và `/api/v2/order/get_order_detail`; token theo shop đi qua `fetchShopeeShopJson()`.
- Shop có API order: Lazada `kinhdoanhonlinegiasoc@gmail.com`, Shopee `chihuy1984`, `chihuy2309`, `phambich2312`. Các shop này quét đơn/trạng thái qua API và upsert `orders_v2`, `order_items`, `order_fee_details` nếu có.
- Shop không API order: Shopee `khogiadungcona`; không polling API giả, chỉ nhận dữ liệu `manual_reference`, `import_file_sync` hoặc `browser_sync` đã có log vào Order Warehouse.
- TikTok `0909128999`: hiện không có API order chính thức trong hệ thống; đơn đang vào Order Warehouse bằng fallback local helper/import/manual, source hiện tại `manual_reference`.
- `importOrdersV2()` giờ ghi `shops.last_order_sync_at/status/error` cho luồng fallback sau khi upsert `orders_v2/order_items`, để UI không im lặng khi shop không API có đơn mới.
- `marketplace_shop_capability_core` giờ expose `order_sync_mode`, `order_sync_mode_label`, `last_order_source_at`, `last_order_source_orders_7d`, `last_order_source_touched_24h` từ `orders_v2`, để UI hiển thị rõ `API / Browser / Import / Manual`.
- `marketplace_shop_capability_core` còn expose `order_runner_type/name/schedule/running_source/status_label`: Shopee/Lazada API là Worker cron `*/5 * * * *`; TikTok/manual/import/browser phải đọc local helper health, không tự gắn API.
- Admin Shop diagnostic ghép local helper `/health?ensure_report_worker=1`; nếu `run_report_jobs.py --watch` không chạy hoặc helper không gọi được thì UI phải hiện đúng `Chưa có runner tự động`.
- `report_worker` chỉ canh `/api/jobs` để tải/import report đọc-only khi có job pending; không gửi tin, không sync Payment live và không gọi marketplace write action.
- Cron Shopee status sync chạy nền giảm `limit` về `10` và truyền `fetch_fees=0`, `fetch_tracking=0`; sync nền không gọi Payment live/escrow và tránh lỗi `Too many subrequests`.
- Mismatch Finance ngày `2026-05-18`: `orders_v2` có `68` đơn `normal`, `order_analytics` chỉ có `67`; đơn thiếu là TikTok `584090485281163170`, shop `0909128999`, revenue import `110.000đ`, source `manual_reference`. Rebuild Finance phải dùng logic hiện tại và không sync Payment live.
- Deploy/verify lượt này: Worker chính `28cb2c4f-02e5-4db4-b4af-dc01769bf0d7`, static UI `ff505d8d-ea7d-49a4-953b-e4066b5f57d2`; Finance Core ngày `2026-05-18` sau rebuild `status=ok`, `orders=68`, `gross_revenue=7.624.224đ`.

## Finance Warehouse/Core cleanup 2026-05-18

Nguồn chuẩn hiện có:

- `order_fee_details`: chi tiết phí/settlement/raw Payment hoặc Finance API.
- `orders_v2` và `order_items`: snapshot đơn, item, cost và metadata vận hành.
- `order_analytics`: Finance Warehouse/Core theo đơn, gồm `revenue`, `actual_income`, `platform_fees`, `cost_of_goods`, `ads_cost_allocated`, `refund_deduction`, `net_profit`, `margin_pct`, `actual_income_source`, `computed_at`.
- `marketplace_order_finance_daily_snapshots`: snapshot ngày/tháng đọc lại nhanh từ `order_analytics`.
- Core đọc chính: `apps/worker-api/src/core/orders/finance-core.js` qua `loadOrderFinanceCore()`.

Guard chống snapshot cũ/bẩn:

- Công thức Finance Core hiện tại có version `finance-core-revenue-basis-max-v20260518`, ghi trong `order_analytics.source_json.calc_version` khi chạy `rebuildOrderAnalytics()`.
- `source_json.source_marker` của row đầy đủ là `order_analytics.finance_core`; row chỉ do payment-sync ghi một phần dùng marker `order_analytics.payment_sync_partial` và bắt buộc rebuild trước khi coi là báo cáo hợp lệ.
- `marketplace_order_finance_daily_snapshots.source_json` cũng ghi `calc_version`; snapshot ngày thiếu version hoặc khác version phải coi là stale.
- `loadOrderFinanceCore()` kiểm `calc_version`, row thiếu/partial/orphan, row thiếu so với `orders_v2` normal và công thức revenue hiện tại: `max(orders_v2.revenue, sum(order_items.revenue_line), marketplace finance revenue basis)`.
- `rebuildOrderAnalytics()` dọn row `order_analytics` cũ không còn khớp `orders_v2.order_type='normal'` trong đúng phạm vi rebuild, để đơn đã chuyển hủy/hoàn không còn nằm trong Finance snapshot.
- Nếu guard phát hiện stale, API trả `status: stale`, `stale_snapshot: true`, `snapshot_health.stale_reasons` và `action: rebuild_order_analytics_without_live_payment_sync`; Dashboard không được âm thầm dùng số `order_analytics` bẩn.
- KPI tổng Doanh thu và breakdown theo shop phải cùng đọc `order_finance_core.by_shop` khi Finance Core `status=ok`; nếu Finance Core stale thì cả tổng và shop breakdown rơi về fallback có marker stale rõ, không trộn tổng Core với chi tiết `orders_v2`.
- Deploy guard production: Worker chính `huyvan-worker-api` version `a5dcbf28-189f-4bf4-8c38-ddfe7477dbe6`. Rebuild ngày `2026-05-18` không gọi sync Payment live: `saved=67`, `deleted_stale=1`, daily snapshot `saved=6`; D1 có `67/67` row `order_analytics` và `6/6` daily snapshot cùng `calc_version`.

Trước khi sửa:

- Profit chart ngày `/api/profit-by-day` tự gom `orders_v2`, return ledger và phí cũ.
- Revenue chart ngày `/api/revenue-by-day` đọc trực tiếp `orders_v2.revenue`.
- Dashboard top shop/platform/SKU/product đọc `orders_v2.profit_real` và tự phân bổ lãi theo `order_items.revenue_line`.
- Export `/api/export-orders` tự phân bổ phí/lãi từ `orders_v2.fee_*` và `orders_v2.profit_real`.
- Income `/api/income/*` là route chuyên biệt đọc Shopee Payment/Lazada Finance/report để đối soát nguồn, chưa phải route báo cáo lịch sử thống nhất.

Sau khi sửa:

- `/api/profit-by-day` và `/api/revenue-by-day` chỉ là wrapper đọc `loadOrderFinanceCore().by_day`.
- `/api/dashboard` trả thêm metadata `order_finance_core` và lấy doanh thu/lãi chính từ `order_finance_core.summary`; fee components vẫn qua `dashboard_finance_fee_core`.
- Chi tiết doanh thu theo shop trong thẻ KPI đọc `order_finance_core.by_shop` cùng version công thức với tổng; dòng nhập đơn từ `orders_v2` chỉ hiển thị như tham chiếu để tránh tổng và chi tiết khác nguồn.
- `/api/top-sku`, `/api/top-product`, `/api/top-shop`, `/api/top-platform`, `/api/top-sku-full` đọc `order_analytics` và chỉ phân bổ theo tỷ lệ item để render chart.
- `/api/export-orders` lấy số tài chính từ `order_analytics`, phân bổ về item row, xuất `finance_source` và `finance_confidence`.
- Frontend export chỉ đọc `result.data` từ API và ghi nguồn Finance vào CSV; frontend không tự tính lại phí/lãi.

Deploy/verify lượt Finance:

- Worker chính `huyvan-worker-api`: `3605a561-cb25-41eb-be05-25234e1a961b`.
- Static UI `shophuyvan-analytics`: `c5da67a2-c3f4-4e9b-8fed-93515743d3a0`.
- Rebuild Finance Warehouse nội bộ `POST /api/order-analytics/rebuild` cho `2026-05-01..2026-05-18`: `orders=1168`, `saved=1168`, snapshot ngày `saved=103`, không gọi sync Payment live.
- Production `GET /api/order-analytics/finance-core`: `orders=1212`, `gross_revenue=146523319`, `net_profit=58578096.75`, `source=order_analytics + order_fee_details + marketplace_return_reverse_ledger + marketplace_ads_*`.
- Production `/api/profit-by-day`, `/api/revenue-by-day`, `/api/dashboard`, `/api/top-sku`, `/api/top-shop`, `/api/top-platform`, `/api/export-orders`: HTTP 200.
- Chrome profile `E:\codex-chrome-profiles\shophuyvan-test`: desktop/tablet/mobile pass, bảng Profit có 104 dòng, 7 chart canvas, overflow ngang `0`.
- Export CSV tải thật tại `artifacts/finance-export-downloads/shophuyvan_export.csv`: 15 cột, có `Nguồn Finance` và `Độ tin cậy`.

Legacy Finance đã cắt khỏi runtime:

- Công thức SQL cũ của `/api/profit-by-day` dựa trên `orders_v2.profit_real` và return ledger.
- `/api/revenue-by-day` đọc trực tiếp `orders_v2.revenue`.
- Top chart Dashboard dùng `orders_v2.profit_real * revenue_line / revenue`.
- Export tự phân bổ `fee_platform/fee_payment/fee_affiliate/fee_ads/fee_piship/fee_service/fee_packaging` từ `orders_v2`.

Chưa xoá vì chưa chắc:

- `calcProfit()` wrapper trong `apps/worker-api/src/utils/db.js`: tên legacy nhưng bên trong đã gọi `fee-phase1-core`; còn dùng cho import/recalc/price-calc write-path.
- `recalcCost()` trong `orders/export-cost-stock.js`: còn là route bảo trì ghi lại cost/profit cho đơn cũ, không phải read-path báo cáo.
- `/api/income/*`: còn cần cho Payment/Finance source-acquisition, payout/report readback và đối soát quyền API.
- `dashboard-aux.js` `priceCalc`: là mô phỏng giá bán từ Product Master + fee core, không phải báo cáo Finance lịch sử.

## Legacy shop-name đã cắt trong runtime mới

- UI Chat/CSKH mới không còn render trạng thái sync bằng `target.shop_id` làm tên chính; trạng thái sync dùng `shopDisplayLabel()` từ `shop_display_name`.
- Shop Core bỏ qua mọi `shop_display_name` dạng raw numeric, `Shopee <id>` hoặc trùng `api_shop_id`.
- Chat Worker bỏ qua mọi tên shop nhận từ Core nếu tên đó vẫn là raw numeric hoặc `Shopee <id>`, rồi chuyển về `Shop chưa đồng bộ tên`.
- Legacy `fe-chat-marketplace` đã bị xóa; `shop/shop_id/api_shop_id` chỉ còn là technical id trong Chat mới/Core hoặc tài liệu lịch sử.
- Chat Core tab `Đơn` dùng `shopDisplayLabel()` khi render Shop Core, không fallback trực tiếp về `shop_name` nếu đó là raw id.

## Chưa xoá và lý do

- `apps/fe/js/dashboard/fe-chat-marketplace/*`: đã xóa khỏi repo/runtime trong lượt Chat legacy cleanup 2026-05-19.
- Các helper lấy order/product/fee trong OMS, Dashboard, Profit, Export: còn runtime public nên chưa xoá; hiện chỉ map để refactor theo thứ tự sau.
- Migration/schema và dữ liệu thật: không xoá vì có nguy cơ mất lịch sử vận hành.

## Việc nối tiếp

1. Giữ Shop và Product đã qua Warehouse, không quay lại fallback raw id/product riêng.
2. Tiếp theo chỉ refactor Order runtime nếu phát hiện màn còn tự map order ngoài `orders_v2/order_items/order_fee_details`.
3. Tiếp theo đối chiếu payout/statement theo kỳ, rồi mới cắt các route Income source-acquisition nếu đã có route Core thay thế đầy đủ.

## Finance Taxonomy Hotfix 2026-05-19

- Core mới: `apps/worker-api/src/core/orders/finance-taxonomy-core.js` chuẩn hóa `gross_revenue`, `buyer_total_paid`, platform voucher, seller cofunded voucher, actual income, phí sàn, thuế, ADS, PiShip và profit basis.
- `gross_revenue` là giá sau KM shop cộng phí vận chuyển người mua trả; không dùng `buyer_total_paid` làm doanh thu đối soát khi có Shopee Voucher.
- `Tổng khấu trừ từ sàn` chỉ gồm seller cofunded voucher có raw field, phí sàn, thuế và adjustment settlement rõ nguồn. Shop discount, platform funded voucher, ADS, PiShip và cost setting không nằm trong bucket này.
- PiShip ưu tiên API/raw `order_income.shipping_seller_protection_fee_amount` hoặc `order_fee_details.fee_piship`; Cost Setting chỉ dùng fallback khi API không có field.
- `order_analytics.source_json.taxonomy` là trace chính cho Dashboard/Profit/Export; OMS render qua `fee-phase1-core`, không tự tính lại ở frontend.
## OMS/Core Hotfix 2026-05-20

- Panel `Đồng bộ & tải lại` nằm trong OMS, nút `Đồng bộ & tải lại`, đọc/ghi qua Warehouse/Core. Tab `Tải lại tem lỗi` gọi `POST /api/label/retry-failed`; payload bắt buộc có ngày/shop/sàn/trạng thái/limit/dry_run. Bảng chính chỉ hiển thị dòng đủ điều kiện hoặc đúng bộ lọc; `downloaded` khi `force=false` chuyển sang `skipped_details`, không trộn vào bảng chính.
- Tab `Đồng bộ lại đơn` gọi `POST /api/orders/manual-sync/backfill`, chỉ cho TikTok `0909128999` và Shopee no-API `khogiadungcona`. Shop API không được đưa sang Seller Center fallback.
- Order Core thêm `order_sync_completeness`: `synced`, `missing_tracking`, `missing_label`, `missing_finance`, `pending_settlement`, `seller_center_detail_missing`, `manual_required`, `api_permission_missing`, `error`. OMS render `Đã đồng bộ`, `Thiếu dữ liệu tài chính`, `Chờ ví TikTok`, `Cần đồng bộ Seller Center` từ Core, không tự đoán hàng loạt `Cần đồng bộ`.
- Tracking Core mới lưu `order_tracking_core`: tracking number, ĐVVC, source, events JSON, last sync/error. OMS nút `Theo dõi` gọi `GET /api/logistics-watch/detail?order_id=...` và hiển thị timeline thật hoặc lý do ngắn.
- Shopee API tracking dùng Open Platform `/api/v2/logistics/get_tracking_info`; Lazada API tracking dùng `/logistic/order/trace`. Nếu thiếu token/quyền thì ghi `api_permission_missing`, không fallback Seller Center cho shop API.
- Lazada shop API `kinhdoanhonlinegiasoc@gmail.com` dùng Order API cho doanh thu và Finance API `/finance/transaction/details/get`, `/finance/transaction/accountTransactions/query`, `/finance/payout/status/get` cho phí/settlement khi có quyền. Khi Finance API chưa có dữ liệu/quyền, OMS hiển thị `Thiếu dữ liệu Finance API`; không lấy cost setting làm nguồn phí chính/confirmed.
- Source routing: `chihuy1984`, `chihuy2309`, `phambich2312` -> Shopee API; `kinhdoanhonlinegiasoc@gmail.com` -> Lazada API; `khogiadungcona` -> Shopee Seller Center fallback; `0909128999` -> TikTok Seller Center/local helper fallback.
- Trang chủ: `Quét mã` mở `pages/scan-qr.html` cho QR đóng gói/hủy/hoàn; `Ghi hình` mở `pages/cctv_packing.html` cho CCTV/quay video đóng gói.

## OMS/Core follow-up 2026-05-20

- TikTok finance pending settlement chỉ ghi `estimated_income` và `Thực nhận tạm tính`; `actual_income` vẫn `null` cho tới khi Seller Center/API có `Số tiền bạn kiếm được` confirmed.
- Tracking route `GET /api/logistics-watch/detail` trả cached Tracking Core events khi Open Platform thiếu quyền/lỗi tạm thời; không hiện `Chưa có lịch trình` nếu `tracking_events` đã có.
- OMS `Nhắn khách` cho Lazada API shop đi qua Chat Worker + Lazada IM bridge (`/im/session/list`, `/im/message/list`, `/im/message/send`). TikTok vẫn manual/local helper rõ, không fake success.
- Lazada Finance Core dùng source `lazada.finance.transaction.details.get`; source singular cũ bị chặn bằng test.

## D1 rows-read cleanup 2026-05-20

- OMS list vẫn đọc route public `/api/orders`, nhưng response list đã cắt payload raw nặng (`fee_raw_data`, raw fee/tracking/source JSON) và thêm proxy metric query.
- `/api/orders/badges` dùng cache TTL ngắn để giảm count sidebar lặp lại; header `X-OMS-Cache` cho biết `miss/hit`.
- Shop capability diagnostics dùng cache TTL khi không đọc secret để tránh quét Core lặp lại trong cùng burst UI.
- D1 index migration `docs/migrations/009_d1_rows_read_oms_indexes.sql` bổ sung index cho list/filter OMS, label retry, job diagnostic, webhook và chat-message lookup.
- Dirty data cleanup mới ở dry-run; không xoá đơn thật. Stale Seller Center diagnostics trên shop API còn `20` dòng cần batch riêng.

## OMS/Data cleanup stabilization 2026-05-20

- Dirty order-item markers are not product data. `Mã yêu cầu trả hàng` is stored as return/refund marker state, not as `order_items.product_name`; `Thiếu chi tiết sản phẩm` is stored as `item_data_status=item_missing`, not as a fake item.
- OMS list reads normalized summary from Core and exposes `item_data_status`, `item_missing_reason`, `return_refund_marker`, and `dirty_item_markers` for UI decisions. SKU mapping must ignore dirty markers.
- `SP_` auto/temp products are hidden from Map SKU by default with `hidden_from_mapping=1`, `sku_type=placeholder`, `user_confirmed=0`. They are visible only when the operator explicitly enables `include_temp=1`.
- Finance Core owns terminal order treatment. Canceled orders use `canceled_excluded`; return/refund pending orders use `return_pending`; UI must not show green profit for either state unless settlement data later confirms a real remaining profit.
- TikTok estimate uses Finance Core fee rows/cost setting consistently. If estimated fees exist, `estimated_income` must be `gross_revenue - estimated fees`; do not set actual/net income equal to gross.
- TikTok runtime pause reason `codex_hotfix_final_pause` is legacy and auto-cleared by `tiktok_runner_control.py`. Radar queues only small safe batches when unpaused, uses profile `E:\shophuyvan-python-automation\profiles\browser\shophuyvan-runner-tiktok`, and must report `runner_requires_login` or a real error if login/session is missing.

## OMS/Runner/Tracking follow-up 2026-05-20

- OMS Chat from order must read Warehouse/Core target data first, then Chat Worker. Lazada session/conversation comes from synced IM rows in `marketplace_chat_conversations`; do not fall back to a blank conversation or a UI-only toast.
- Runner diagnostics are part of Core observability. Auto jobs are PASS only after `queued -> running -> completed` or a classified failure such as `runner_requires_login`; `queued` alone is not PASS.
- Tracking endpoint data must be written/read through Tracking Core. If Shopee/Lazada API returns tracking/timeline data, OMS row must prefer that Core summary and keep stale retry/batch errors only as diagnostics.
- Dirty read model cleanup remains scoped: dry-run first, no order/payment/refund/return deletion, and placeholder `SP_` or dirty item labels stay hidden from default Map SKU/order item views.
- Shopee operations write actions are backend-disabled until explicitly reopened. `ship_order`/`mass_ship_order` must return `write_action_disabled` and `sent_to_shopee=false`; TikTok helper must not click `Sắp xếp vận chuyển`.
## Cập nhật 2026-05-21 - Automation action đi qua Core/Warehouse

- Python automation production đã tách theo action: `pull_orders`, `refresh_status`, `sync_detail`, `sync_finance`, `retry_label`.
- TikTok `0909128999` và Shopee no-API `khogiadungcona` mới được dùng Chrome automation; profile lấy từ `oms_python/core/automation_profiles.py` dưới `E:\shophuyvan-python-automation\profiles\browser`.
- Shop API Shopee/Lazada không dùng Seller Center fallback; thiếu field/endpoint phải kiểm Open Platform/Worker API trước.
- Kết quả action phải ghi vào Order Core, Status Core, Tracking Core, Finance Core hoặc Label Core rồi OMS đọc lại từ read model; không tự map ở UI.
- `retry_label` chỉ tải PDF tem và cập nhật Label Core; không gọi ship/arrange/confirm/cancel/hủy/giao hàng/sắp xếp vận chuyển.

## Cập nhật 2026-05-21 - Readback Final Core Seller Center/API

- TikTok finance transaction đã quy về Finance Core: `source=tiktok_seller_center_finance_transaction`, `settlement_status=pending_settlement`, `finance_confidence=estimated`, `estimated_income/settlement_total=67.755`, `actual_income=null`.
- TikTok logistics drawer đã quy về Tracking Core: sample `584128214410102531` có tracking `TTVN1088367610`, carrier `BEST Express`, source `tiktok_seller_center_logistics_drawer`, 3 events. Customer/Contact Core giữ masked khi Seller Center không reveal plaintext; không ghi masked như dữ liệu thật.
- TikTok/Shopee chat từ đơn chỉ được ghi/open theo Chat Core/manual route; lượt này chỉ mở conversation đúng khách/order, không gửi tin live và không fake `sent`.
- Shopee no-API finance detail đã quy về Finance Core: sample `260520VPM23704` có `product_revenue_after_shop_discount=99.000`, `buyer_shipping_paid=8.000`, `platform_voucher_total=21.780`, `seller_cofunded_voucher_amount=6.534`, `actual_income=70.030`, `settlement_status=confirmed`.
- Shopee no-API tracking đã quy về Tracking Core source `shopee_seller_center_tracking_expanded`; sample hiện có 1 event từ DOM sau khi bấm `Mở rộng`.
- Lazada API path giữ API-first: order/status/trace/label đi Worker/Open Platform; finance actual thiếu settlement confirmed thì Core giữ `actual_income_available=false` và `profit_label=Lãi tạm tính`.

## 2026-05-22 - OMS retry queues từ Warehouse/Core

- Label retry queue lấy từ Order Core + Label Core + Tracking Core; điều kiện chính gồm label retry status, document generating, not ready, failed, thiếu file label khi tracking thật đã có.
- Finance resync queue lấy từ Finance Core; cost setting fallback, pending settlement, pending return settlement, failed và terminal finance stale vẫn vào `sync_finance`.
- Tracking resync queue lấy từ Tracking Core; tracking missing/stale/failed, thiếu tracking cho đơn cần vận chuyển, events rỗng khi tracking thật đã có đều vào `refresh_tracking`.
- UI chỉ gửi payload job/date scan; Warehouse/Core quyết định eligible, skip reason, action path và queue payload.
### 2026-05-27 - Customer Core từ TikTok/Lazada

- Bảng chuẩn mới: `marketplace_customer_contacts` trong Worker API Customer Core.
- Bảng phụ mới 2026-05-28: `marketplace_customer_contact_orders` lưu `contact_key + source_order_id` để rebuild append/merge dữ liệu mới mà không xóa contact cũ và không cộng trùng đơn đã quét.
- Nguồn vào: TikTok Seller Center runner `sync_detail` -> `orders_v2`/`order_tracking_core`; Lazada Open Platform `/orders/get` -> Customer Core direct upsert.
- Màn hình đọc: `apps/fe/pages/customer-database.html` chỉ đọc `/api/customers/marketplace*`.
- Không dùng UI làm nguồn dữ liệu thứ hai; Facebook/Zalo chỉ là trạng thái readiness, chưa có live-write/export tự động.
- 2026-06-03 mở rộng nguồn vào từ Chat Core: Shopee/Lazada/TikTok/Zalo/Facebook message inbound của khách có SĐT/địa chỉ sẽ đi `Chat Worker -> /api/customers/marketplace/chat-ingest -> Customer Core`, không tạo CRM/chat-contact table riêng.
- Backfill lịch sử chat dùng `POST /api/chat/customer-contacts/backfill`; route này chỉ quét message có tín hiệu liên hệ và dùng secret nội bộ để ghi sang Worker chính.
- Remarketing guard: dữ liệu chat chỉ là contact lead với `consent_status=unknown`, `contact_status=not_contacted`; không tự suy ra khách đã đồng ý nhận marketing.
- 2026-05-27 Chat/OMS order context: màn hình Chat/CSKH vẫn chỉ đọc đơn từ Order/Warehouse Core; khi gửi tin Shopee chủ động, frontend lấy `order_id` đang hiển thị trong panel Đơn nếu conversation chưa có sẵn, backend mới quyết định payload SellerChat. Không tạo nguồn dữ liệu đơn thứ hai ở UI.
