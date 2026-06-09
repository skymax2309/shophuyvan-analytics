# Bản đồ core dữ liệu Shop / Order / Product / Finance

Ngày cập nhật: 2026-05-28

## Product Core search tên dài cho Chat AI 2026-05-28

- Route chuẩn giữ nguyên: `GET /api/core/products/search`, `GET /api/core/products/by-sku/:sku`.
- File chuẩn mới: `apps/worker-api/src/core/products/core-product-read-core.js` sở hữu `getCoreProductBySku()` và `searchCoreProducts()`; `apps/worker-api/src/core/shared-data/shop-core-data.js` sở hữu Shop Core summary dùng chung cho Product/Order context.
- Query tên sản phẩm dài được tách thành token an toàn, tránh D1 `LIKE or GLOB pattern too complex`. Khi query có token dạng mã/SKU như `K75`, Core ưu tiên token đó để trả đúng nhóm sản phẩm thay vì match từ phổ thông.
- Production readback sau Worker `204213c9-6b18-4b49-8c73-50712e17ec4c`: tên dài Lazada K75 trả `matched_product_core`, `search_needles=["K75"]`, không warning; Chat AI prompt context cho hội thoại Lazada có `product_context_count=5`, `core_context_warnings=[]`.

## Chat AI Context Builder 2026-05-28

- Chat Worker AI dùng `buildAiReplyContext()` để đọc Chat Core trước, sau đó đọc Worker Core qua route công khai an toàn: `/api/core/orders/:orderId`, `/api/core/orders/by-conversation/:conversationId`, `/api/core/products/by-sku/:sku`, `/api/core/products/search`.
- `by-conversation` được gọi khi có `conversation_id` kể cả khách chưa gõ mã đơn, để dùng liên kết đơn đã gắn với hội thoại. Nếu khách gõ SKU rõ ràng, Product Core thử `by-sku` trước rồi mới search.
- Context trả về `orders`, `products`, `order_codes`, `product_queries`, `warnings`, `risk_flags`; prompt chỉ được trả lời theo context này và phải xin thêm mã đơn/SKU nếu thiếu dữ liệu.
- `0` được giữ là dữ liệu thật trong context (`0đ`, `0 tồn`); `null`/missing mới thành cảnh báo thiếu dữ liệu.
- Policy đọc `CHAT_AI_MODE=suggest_only`; production dry-run đã xác nhận `policy_status=needs_review`, `auto_send=false` dù capability là `bridge`.
- Đã xử lý tiếp: Product Core search theo tên dài Lazada K75 trả `matched_product_core`, `search_needles=["K75"]`; route SKU vẫn trả sản phẩm và Chat AI không còn warning context cho case này.

## Chat AI auto-simple + learning 2026-05-28

- `ai_suggestions.prompt_context` là log chuẩn cho dữ liệu AI đã dùng: `delivery_mode`, `simple_intent`, `order_context_count`, `product_context_count`, `order_codes`, `product_queries`, `core_context_warnings`, `context_risk_flags`.
- `CHAT_AI_MODE=auto_simple` cho phép auto-send chỉ khi `simple_intent.simple=true`, intent thuộc `order_status_simple/product_info_simple`, có dữ liệu Order/Product tương ứng, không có warning/risk và policy text approved.
- `ai_knowledge_base` chỉ nhận dữ liệu khi nhân viên duyệt hoặc gửi câu trả lời đã dùng gợi ý AI. Hội thoại sống không tự học thẳng vào knowledge nếu chưa duyệt.
- `POST /api/chat/ai/reject` đặt `ai_suggestions.final_state=rejected` để hủy học/gợi ý sai; không xóa lịch sử audit.
- UI Chat/CSKH đọc `prompt_context` từ suggestion response để hiện tóm tắt `AI đã soạn từ dữ liệu đã kiểm`, không tự tính nghiệp vụ và không render raw/debug.

## Chat read-state lock 2026-05-27

- `chat_conversations.unread_count` thuộc Chat Core: chỉ message khách mới ghi vào `chat_messages` được tăng số chưa đọc; merge message lịch sử trùng không tăng lại sau khi nhân viên đã mở đọc.
- `chat_conversations.last_message_text/last_message_at` chỉ nhận message mới hơn hoặc cùng thời điểm; lịch sử Shopee polling không được đẩy preview danh sách lùi về tin cũ.
- UI chỉ gọi sync và render read-model; `syncChannel()` phải chờ Chat Core/bridge hoàn tất rồi mới reload trạng thái.

## Chat no-API scheduler + order/product context 2026-05-27

- Chat Core là nguồn conversation/message; Order/Product/Tracking context vẫn đọc Worker Core qua `/api/core/orders/by-conversation/*`, `/api/core/products/*`, `/api/logistics-watch/detail`.
- `chat_conversations.customer_name` có repair Core từ `chat_messages.sender_name` khi dữ liệu cũ thiếu tên khách; UI không vá tên riêng.
- `GET /api/chat/conversations?q=...` tìm được cả message text, `order_id`, attachment order-card để mở lại hội thoại cũ theo mã đơn.
- Scheduler local helper có nhánh `sync_chat` cho shop no-API: TikTok `0909128999`, Shopee `khogiadungcona`; shop API vẫn dùng SellerChat/Lazada IM Open Platform trước.
- Production verified order `584128214410102531`: `/api/core/orders/by-conversation/*` trả order/item, `/api/logistics-watch/detail` trả tracking `TTVN1088367610` và `BEST Express`; Chat UI render customer/order/product/tracking trên desktop/tablet/mobile.

## Chat sender + OMS deep-link 2026-05-27

- TikTok browser helper chỉ là nguồn ingest; Chat Core là nơi chuẩn hóa `chat_messages.sender_type` thành `customer`, `shop`, `system`. UI chỉ render nhãn `Khách/Shop/Hệ thống` từ read-model.
- Dữ liệu preview TikTok cũ đã repair production theo bằng chứng nội dung: `5` system và `4` shop rows; message khách thật trong đơn mẫu vẫn giữ `customer`.
- TikTok không có Product Card API: nút gửi sản phẩm chỉ dùng sản phẩm đã đọc từ Product Core để tạo bản nháp thủ công, không ghi trạng thái sent/card thành công.
- OMS mở Chat theo đơn dùng Order Core `chat-target` và `chat-confirmation-template`; nếu khách chưa có conversation lưu sẵn, frontend giữ một context theo đơn nhưng panel vẫn đọc Order/Product/Tracking Core, không tự ghép nghiệp vụ.
- Bản nháp xác nhận lưu trong state giao diện để context reload không làm mất nội dung; chế độ production là `draft_only`, chưa ghi nhận gửi live.

## TikTok Finance Lock 2026-05-27

- Finance Core đọc TikTok Seller Center cho doanh thu, phí sàn, thuế, SFR và settlement; `actual_income` vẫn `null` khi settlement pending.
- `ADS ngoài ví` và `PiShip` là chi phí ngoài ví/Cost Setting, chỉ trừ trong lợi nhuận và nằm ở `ads_fee_total`, `piship_fee`, `ops_cost_setting_total`.
- Không đưa `ADS ngoài ví`/`PiShip` Cost Setting vào `platform_deduction_total`, `total_deductions`, `marketplace_fee_total` hoặc `tax_total`; UI OMS chỉ render các field Core này.
- Skill `shophuyvan-finance-core-guard` có mục `TikTok Finance Lock` và regression khóa bằng `scripts/test-finance-taxonomy.mjs`, `scripts/test-tiktok-seller-center-finance.mjs`, `scripts/check-oms-core-regression-lock.mjs`.
- Production readback sau deploy Worker `25ae3ebb-f598-4637-8b22-d692aa6b5b39`: đơn `584211305752462759` trả `estimated_income=37975`, `actual_income=null`, `ads_fee_total=5500`, `piship_fee=2008`, `ops_cost_setting_total=2008`, nhóm internal `7508`, `total_deductions=0`, `profit_real=11467`. OMS chỉ render read-model này trên desktop/tablet/mobile.

## Cập nhật OMS order detail evidence 2026-05-27

- `orders_v2.payment_method`: phương thức thanh toán theo Open Platform order detail/list. Shopee source chính là `/api/v2/order/get_order_detail.payment_method`; Lazada source chính là `/orders/get.payment_method`.
- `orders_v2.payment_method_source`: chỉ ghi khi `payment_method` có dữ liệu thật; không dùng `/api/v2/payment/get_payment_method_list` làm per-order evidence.
- `orders_v2.customer_note`: ghi chú khách/buyer note từ Open Platform. Shopee ưu tiên `message_to_seller`; Lazada ưu tiên `buyer_note`/`remarks`.
- `orders_v2.customer_note_source`: source field cụ thể để UI biết đây là dữ liệu API hay còn thiếu.
- `order_tracking_core.tracking_events`: timeline vận chuyển chuẩn hóa. Shopee source `/api/v2/logistics/get_tracking_info`; Lazada source `/logistic/order/trace`.
- UI OMS chỉ đọc các field này qua `/api/logistics-watch/detail`; mọi endpoint call và chuẩn hóa nằm ở Worker/Core.

## Cập nhật tách ADS và Promotion Core 2026-05-24

- ADS quảng cáo chỉ còn màn quyết định quảng cáo; tab quản lý khuyến mãi đã tách khỏi `apps/fe/pages/ads.html`.
- Màn mới `apps/fe/pages/promotions.html` quản lý 8 module khuyến mãi: Shopee Discount, Shopee Voucher, Shopee Bundle, Shopee Add-On, Shopee Flash Sale, Lazada Voucher, Lazada Freeship, Lazada Flexicombo.
- Read-model module mới: `GET /api/discounts/promotion-module-read-model?platform=&module=&shop=&status=&limit=`. Route trả `programs`, `items`, `capabilities` người dùng từ Promotion Core hiện có.
- Promotion Core hiện vẫn dùng bảng production đã có: `marketplace_discounts`, `marketplace_discount_items`, `marketplace_vouchers`, `marketplace_promotion_programs`, `marketplace_promotion_items`, `marketplace_promotion_apply_queue`, `marketplace_discount_actions`. Khi cần rename sang schema `promotion_programs/promotion_items/promotion_capabilities/promotion_action_logs`, phải làm migration/compat layer riêng, không đổi đột ngột làm vỡ production.
- UI Khuyến mãi sàn chỉ hiển thị trạng thái nghiệp vụ. Endpoint, payload, request id dài và raw response giữ trong backend/action log.
- Production đã deploy Worker `huyvan-worker-api` version `a637c316-4d53-4198-b20d-ae4f97fc9bf1`, static `shophuyvan-analytics` version `8d8cd111-f332-41f8-ba3e-2753f16963e5`; đã kiểm bằng profile `E:\codex-chrome-profiles\shophuyvan-test` trên mobile/tablet/desktop.

## Cập nhật ADS Core và UI người vận hành 2026-05-24

- ADS Core là nguồn chuẩn cho quảng cáo; UI không tự tính ROAS/ACOS/lãi sau ADS/khuyến nghị.
- Bảng campaign chuẩn: `ads_campaigns(platform, shop_key, campaign_id, campaign_name, campaign_type, status, budget, daily_budget, roas_target, start_time, end_time, source, last_synced_at, raw_payload)`.
- Bảng adgroup chuẩn: `ads_adgroups(platform, shop_key, campaign_id, adgroup_id, adgroup_name, status, budget, bid_price, roas_target, source, last_synced_at, raw_payload)`.
- Bảng liên kết sản phẩm quảng cáo: `ads_product_links(platform, shop_key, campaign_id, adgroup_id, item_id, model_id, sku_id, seller_sku, internal_sku, product_name, source, match_status)`.
- Bảng metric ngày: `ads_daily_metrics(date, platform, shop_key, campaign_id, adgroup_id, sku_id, spend, impressions, clicks, orders, ads_revenue, ctr, cpc, roas, acos, source, last_synced_at)`.
- Read model quyết định: `ads_decision_read_model(sku_id, product_name, image_url, current_stock, current_cost, spend, ads_revenue, profit_after_ads, roas, acos, recommendation, recommendation_reason, data_status, action_status)`.
- Capability ghi thật: `ads_write_capabilities(platform, shop_key, action, endpoint, allowed, requires_admin_confirm, requires_preview, requires_readback, capability_status, last_verified_at)`.
- Log thao tác: `ads_action_logs(action_id, platform, shop_key, action_type, target_type, campaign_id, adgroup_id, sku_id, before_payload, proposed_payload, write_payload, response_payload, readback_payload, user_facing_result, status, error_code, error_message, created_by, created_at, applied_at, readback_at)`.
- UI `ADS quảng cáo` đọc read model/capability/log người vận hành; nội dung kỹ thuật giữ backend, không render ra màn hình.

## Cập nhật Purchase/Warehouse Core giá vốn theo lô 2026-05-24

- Kho nhập hàng là kho chung: không có dimension shop trong tính tồn/giá vốn; khóa kho là `internal_sku/warehouse_sku`. `seller_sku`, `platform` chỉ phục vụ tham chiếu Product Core.
- Product Logistics Profile fields: `sku_id`, `internal_sku`, `package_length_cm`, `package_width_cm`, `package_height_cm`, `package_weight_kg`, `package_volume_m3`, `default_quantity_per_package`, `shipping_calculation_method`, `logistics_profile_source`, `logistics_profile_status`, `last_logistics_profile_updated_at`.
- Import Shipment/Purchase Batch fields: `import_batch_id`, `batch_code`, `import_date`, `supplier_name`, `forwarder_name`, `purchase_tracking_number`, `container_or_waybill_no`, `shipment_status`, `customs_declaration_no`, `customs_declaration_date`, `invoice_no`, `currency`, `exchange_rate`, `total_package_count`, `total_quantity`, `total_weight_kg`, `total_volume_m3`, `total_purchase_value`, `total_declared_value`, `total_shipping_fee`, `total_tax`, `total_landed_cost`, `note`, `source`, `raw_payload`.
- Công thức vận chuyển Core: `package_volume_m3 = length*width*height/1000000`; `total_weight_kg = package_count*package_weight_kg`; `total_volume_m3 = package_count*package_volume_m3`; `greater_of_weight_or_volume` dùng `max(total_weight_kg, total_volume_m3*volumetric_factor)`.
- Revision fields: `revision_id`, `purchase_batch_id`, `purchase_batch_item_id`, `sku_id`, `before_payload`, `after_payload`, `changed_fields`, `edited_by`, `edited_at`, `edit_reason`.
- Product Core cung cấp danh sách SKU cho trang nhập hàng qua `product_variations/products`; SKU không tồn tại trong Product Core bị block `sku_not_found_in_product_core`, không tạo SKU rời trong luồng nhập hàng.
- Purchase Core fields chính: `purchase_batch_id`, `import_date`, `sku_id`, `internal_sku`, `seller_sku`, `product_id`, `product_name`, `shop_key`, `supplier_name`, `purchase_tracking_number`, `quantity_imported`, `package_count`, `quantity_per_package`, `quantity_remaining`, `currency`, `exchange_rate`, `unit_purchase_price_foreign`, `unit_purchase_price_vnd`, `declared_tax_price`, `domestic_shipping_cost`, `international_shipping_cost`, `shipping_allocation_rule`, `vat_percent`, `vat_amount`, `import_tax_amount`, `other_fee`, `total_batch_cost`, `landed_cost_per_unit`, `formula_snapshot`, `raw_payload`.
- Inventory Cost Layer fields chính: `sku_id`, `purchase_batch_id`, `import_date`, `quantity_imported`, `quantity_consumed`, `quantity_remaining`, `landed_cost_per_unit`, `layer_status`.
- `sku_current_cost_read_model` là contract đọc giá vốn hiện tại: `sku_id`, `internal_sku`, `current_cost`, `current_cost_method=weighted_average_remaining_stock`, `total_remaining_stock`, `batch_count`, `latest_import_date`, `latest_landed_cost_per_unit`, `reference_cost`, `cost_status`, `source=warehouse_purchase_core`.
- Số `0` là dữ liệu thật; `null` là thiếu dữ liệu. Nếu hết cost layer còn tồn thì `current_cost=null`, không ép về `0`.

## Cập nhật Final Core module sync 2026-05-21

- OMS read model trả trạng thái sync riêng theo operation/detail/tracking/finance/label/chat từ `read-core`; `finance_needs_resync`, `finance_source`, `finance_badge_source`, `finance_missing_reason`, `last_finance_error` là contract đọc row để đơn terminal hoặc cost-setting fallback vẫn vào luồng cập nhật tài chính.
- TikTok transaction panel đi vào Finance Core bằng source `tiktok_seller_center_finance_transaction`. Fee taxonomy phải render fee/tax parsed của TikTok Seller Center như nguồn marketplace đã quét; `actual_income` vẫn `null` khi settlement còn pending.
- Lazada order chat target là route Core đọc Order Core + Shop Core + session IM đã sync. Khi chưa có conversation row, route phải trả target thiếu session rõ ràng sau null guard, không tạo nguồn chat mới và không fake open/send success.

## Cập nhật profile map automation 2026-05-21

- Profile map chung nằm ở `E:\shophuyvan-python-automation\oms_python\core\automation_profiles.py`, mỗi row có `platform`, `shop_key`, `shop_name`, `automation_allowed`, `chrome_profile_path`, `profile_status`, `last_verified_at`, `source`, `reason`.
- `source=api` cho Shopee API `chihuy1984/chihuy2309/phambich2312` và Lazada API `kinhdoanhonlinegiasoc@gmail.com`; các shop này không được chạy Chrome automation dù có profile manual để kiểm/login.
- `source=local_browser` chỉ cho TikTok `0909128999` và Shopee no-API `khogiadungcona`, chạy qua profile chuẩn trong `E:\shophuyvan-python-automation\profiles\browser`.
- Lazada profile manual đã tạo: `E:\shophuyvan-python-automation\profiles\browser\HuyVan_Bot_Data_lazada_kinhdoanhonlinegiasoc`; production Lazada vẫn đi Open Platform/Worker API.
- Audit CDP hiện tại: `HuyVan_Bot_Data_Shop1` thấy `phambich2312`, `HuyVan_Bot_Data_Shop2` thấy `chihuy2309`, `HuyVan_Bot_Data_Shop3` chỉ xác định probable `chihuy1984` và đang cần login. Chưa rename vì các Chrome profile đang mở.

## Hotfix vận hành auto kéo đơn/trạng thái 2026-05-20

- Core không tạo nguồn dữ liệu thứ hai: shop API ghi đơn/trạng thái vào `orders_v2/order_items/order_fee_details` qua Worker Cron/API; shop no-API ghi qua import/browser/local helper rồi vẫn đi vào Order Warehouse.
- Shop API tự sync nền: Shopee `chihuy1984`, `chihuy2309`, `phambich2312` và Lazada `kinhdoanhonlinegiasoc@gmail.com` đọc `last_order_sync_at`, `last_order_status_sync_at`, `next_sync_at`, `last_api_sync_result/error` từ capability `/api/shops/api-configs`.
- Worker cron chỉ xử lý shop API bằng batch nhỏ và không tự queue Chrome fallback cho `khogiadungcona`/TikTok; no-API phải đi qua Radar/local scheduler đã lưu `last/next/result/error`.
- Lazada cron nền tắt trace sâu và suppress push live để giảm subrequest; lỗi API thật được ghi vào diagnostic thay vì che bằng trạng thái process Radar.
- RADAR chỉ chịu trách nhiệm no-API/local fallback. Cấu hình auto đọc từ `/api/bot/settings`, snapshot local ở `E:\shophuyvan-runtime\auto-order-scheduler\config.json`, trạng thái chạy ở `status.json`.
- `Đánh thức ngay` là wake scheduler check: local helper ghi `wake.json`, Radar consume wake, nếu auto đang bật và trong active window thì check/run theo interval; nếu chưa chạy hoặc ngoài giờ thì diagnostic trả reason rõ `Chưa từng chạy từ khi bật auto`, `Ngoài khung giờ chạy`, `Auto đang tắt` hoặc `Scheduler chưa chạy`.
- TikTok auto nền được phép chạy theo scheduler nếu user bật và runner không paused; trạng thái phải đọc từ runtime hiện tại. Reason cũ `codex_hotfix_final_pause` là legacy và phải auto-clear, không được làm TikTok manual-only vĩnh viễn.

## Hotfix production OMS 2026-05-20

- Finance Core phân biệt Lazada confirmed/estimate: `lazada.finance.transaction.details.get` là nguồn confirmed; `lazada.orders.get+order.items.get` và cost setting chỉ là estimate/fallback, không được nâng thành `actual_income_available=true`.
- `/api/orders` đọc thêm `order_tracking_core` để đồng bộ tracking number/events giữa Order Core, Tracking Core và OMS row. Drawer dùng tracking từ API response nếu Order Core chưa kịp có mã vận đơn.
- `order_sync_completeness` bỏ qua stale Seller Center diagnostic trên shop API và chỉ cho `khogiadungcona` rơi vào nhánh Seller Center fallback.
- `oms-resync-panel.js` dùng danh sách shop từ Core, lọc dropdown theo sàn và gửi giá trị kỹ thuật `shop_id/shop_key`; bảng kết quả tách `downloaded` và `skipped` khỏi bảng chính khi bộ lọc không chọn.

## Cụm vận hành OMS Đồng bộ & tải lại 2026-05-20

- Core data không tạo schema mới; cụm vận hành mới chỉ đọc/ghi qua `orders_v2`, `order_items`, `order_fee_details`, `order_analytics`, `order_labels` và resolver nguồn `order-data-source-resolver.js`.
- Route tải lại tem lỗi: `POST /api/label/retry-failed`. Bộ lọc bắt buộc gồm `from/to`, `platform`, `shop_id`, `label_status`, `dry_run`, `force`, `limit`. Response chuẩn có `scanned`, `eligible`, `downloaded`, `pending_retry`, `manual_required`, `skipped`, `errors`, `next_cursor`, `next_retry_at`, `details`.
- Route đồng bộ lại đơn không API: `POST /api/orders/manual-sync/backfill`. Route chỉ queue job Seller Center/local helper read-only; dữ liệu thực đi về Warehouse/Core qua `/api/orders/tiktok-seller-detail/backfill` hoặc `/api/orders/shopee-seller-detail/backfill`.
- Source routing cố định: `chihuy1984/chihuy2309/phambich2312/kinhdoanhonlinegiasoc@gmail.com -> API`, `khogiadungcona -> Shopee Seller Center fallback`, `0909128999 -> TikTok Seller Center/local helper fallback`, Lazada API shop tiếp tục đi Lazada API.
- Shopee no-API không được tự dựng URL từ `order_sn`. Nếu thiếu detail URL thì job phải search Seller Center, verify mã đơn trên trang rồi mới lưu `seller_center_detail_id/detail_url`; không tìm được thì ghi `seller_center_detail_url_not_found` cho no-API/manual, không ghi cho API shop.
- TikTok runner policy: profile automation riêng `E:\shophuyvan-python-automation\profiles\browser\shophuyvan-runner-tiktok`, batch nhỏ, retry/backoff theo runner control, không dùng profile user. Nếu thiếu login/session thì trả `runner_requires_login` hoặc lỗi thật; profile `E:\codex-chrome-profiles\shophuyvan-test` chỉ dùng kiểm production UI.
- Lỗi kỹ thuật dài không render trực tiếp ở row OMS; read model/UI chỉ đưa message ngắn, technical detail nằm trong tooltip/result diagnostic.

## Hotfix OMS source/label API 2026-05-20

- Order read model bổ sung source resolver chuẩn: `official_api_first` cho Shopee API shops `chihuy1984`, `chihuy2309`, `phambich2312`, `kinhdoanhonlinegiasoc@gmail.com`; `seller_center_fallback` chỉ cho `khogiadungcona`; `tiktok_seller_center_or_manual` cho TikTok `0909128999`.
- Field nguồn trả về OMS phải đúng capability: `source_label=API` và `status_source=shopee_open_platform/lazada_open_platform` cho shop có API, dù dữ liệu cũ trong `orders_v2` từng bị ghi `browser_sync` hoặc `seller_center_detail_url_not_found`.
- Seller Center detail route chỉ được ghi/upsert/queue khi resolver trả `seller_center_allowed=true`; API shop bị chặn bằng diagnostic `source_mismatch_api_shop_not_seller_center` thay vì ghi lỗi Seller Center lên đơn.
- `marketplace_shop_capability_core` cho Shopee API chuyển từ `api_read_only_existing_document` sang `api_document_generation_then_download`: đây là flow chứng từ in chính thức `create_shipping_document` -> `get_shipping_document_result` -> `download_shipping_document`, có guard `label_fulfillment_action_allowed=false`.
- `order_labels.error` chỉ lưu mã ngắn như `pending_document_generation`, `shopee_pdf_not_ready`, `pending_retry`, `lazada_batch_requeued`; lỗi kỹ thuật dài không còn là text đỏ trên row OMS.
- Lazada label backfill dùng batch nhỏ và budget subrequest: default limit `8`, max limit `20`, max subrequest estimate `32`; khi vượt budget thì đặt `orders_v2.next_retry_at` và giữ queue, không hard fail toàn batch.

## Hotfix automation runner 2026-05-20

- Không đổi schema Warehouse/Core. Runner TikTok dùng control file ngoài repo tại `E:\shophuyvan-runtime\runner-control\tiktok\` để ghi lock/PID/heartbeat/status/pause/stop/retry.
- Profile automation TikTok: `E:\shophuyvan-python-automation\profiles\browser\shophuyvan-runner-tiktok`; profile automation Shopee no-API detail: `E:\shophuyvan-python-automation\profiles\browser\HuyVan_Bot_Data_khogiadungcona`. Không dùng profile user `shophuyvan-test` cho runner nền.
- Local helper expose control thật: `GET /tiktok-runner/status`, `POST /tiktok-runner/pause`, `POST /tiktok-runner/resume`, `POST /tiktok-runner/stop`. Admin merge các field này vào shop TikTok.
- Retry/cooldown: tối đa `3` lần/order, backoff `10 phút -> 20 phút -> 40 phút` và tối đa `3 giờ`, cooldown batch `90s`, ghi `next_retry_at`.
- Status/detail/label vẫn đi qua Order Core như mục dưới: API shop dùng API chính thức; shop không API dùng Seller Center fallback; auto label chỉ tải read-only hoặc `manual_required`.

## Cleanup khóa vận hành status/detail/label 2026-05-20

- Core data không đổi schema mới; chỉ dùng các field diagnostic hiện có trong `orders_v2`, `order_labels` và capability shop để hiển thị rõ trạng thái vận hành.
- `orders_v2` tiếp tục giữ `last_status_sync_at`, `last_status_sync_status`, `last_status_sync_error`, `status_source`, `detail_url_source`, `detail_url_verified_at`, `next_retry_at`; `order_labels` giữ `refreshed_at`, `error`, `storage_key` cho label runner.
- `/api/core/shops`/Admin shop capability gom thêm summary vận hành theo shop: status runner, detail parser, label runner, `manual_required`, lỗi gần nhất và số đơn chờ retry. OMS hiển thị diagnostic theo từng đơn.
- Route legacy `/api/labels/refresh/*` chỉ trả `410`; không còn frontend caller. Route chuẩn vẫn là `/api/label/:orderId/refresh` và `/api/label/backfill-eligible`.
- Guard `test-legacy-flow-locks` khóa lại các lỗi cũ: Python/local helper không gọi `create_shipping_document`, `get_shipping_document_result`, `ship_order`; Worker label route chỉ được tạo/tải chứng từ in có guard `allowFulfillmentAction=false`; local helper phải từ chối `refresh_label`/`print_label` legacy.

## Cập nhật realtime status, Seller Center detail và auto label 2026-05-19

- Order Core hiện nhận trạng thái mới từ ba điểm: cron `scheduled()`, sau `importOrdersV2()` và route backfill/manual `POST /api/orders/status/sync`. Mọi raw status đều phải qua `mapMarketplaceOrderStatus()` trước khi ra `fulfillment_status_core`, `display_status_vi`, `label_eligible`, `label_status`, `terminal_status`.
- Shopee API shops `chihuy1984`, `chihuy2309`, `phambich2312` polling bằng Shopee Open Platform; Lazada `kinhdoanhonlinegiasoc@gmail.com` polling bằng Lazada API. Shopee no-API `khogiadungcona` và TikTok/manual dùng Seller Center/local helper fallback, không được gắn nhãn API.
- Trạng thái realtime ghi diagnostic ở `orders_v2`: `last_status_sync_at`, `last_status_sync_status`, `last_status_sync_error`, `status_source`, `status_changed_at`, `status_touched_24h`, `status_changed_count`, `next_retry_at`; read model trả lại các field này trong `order_status_detail.automation`.
- Shopee Seller Center detail fallback dùng route `/api/orders/shopee-seller-detail/eligible|queue|backfill|diagnostic` và local parser `parser_chitiet.py` qua action `sync_detail`/`sync_finance`. Chỉ có `order_sn` thì phải resolve URL bằng Warehouse field hoặc Seller Center search; không tự dựng `/portal/sale/order/<order_sn>`.
- Field detail Shopee lưu ở `orders_v2`: `seller_center_detail_id`, `seller_center_detail_url`, `seller_order_detail_id`, `source_url`, `raw_detail_url`, `detail_url_source`, `detail_url_verified_at`. Nguồn browser fallback luôn là `shopee_seller_center_detail`, không phải Shopee API.
- Payment/finance từ Seller Center detail chỉ ghi khi parser thấy phần thanh toán. Nếu thiếu phần này thì `actual_income` giữ `NULL` hoặc confirmed cũ, route ghi diagnostic `finance_detail_missing`/`needs_payment_section` và không tạo doanh thu giả.
- Auto label dùng `POST /api/label/backfill-eligible` / `POST /api/label/retry-failed` và `backfillEligibleLabels()`. Shopee/Lazada API dùng Worker/Open Platform document route; Shopee no-API `khogiadungcona` và TikTok `0909128999` queue `retry_label` để local Chrome runner gọi `taitem.py` bằng profile map chuẩn.
- Legacy `POST /api/labels/refresh/*` vẫn trả `410`; route chuẩn lưu tem là `POST /api/label/:orderId/refresh` cho một đơn và `/api/label/backfill-eligible` cho batch eligible. Không gọi create/ship/arrange, không đổi trạng thái đơn trên sàn và không sync Payment live.

## Cập nhật Order Status Core phase 2 2026-05-19

- Order status đi theo luồng chuẩn: marketplace/import raw status -> `mapMarketplaceOrderStatus()` hoặc `normalizeImportedWorkflowStatus()` -> `orders_v2.oms_status/shipping_status/order_type` -> `normalizeOrderReadModel()` -> OMS/Dashboard/Export/Chat.
- Core chính: `apps/worker-api/src/core/orders/status-core.js` với `normalizeOrderStatusCore()` và `mapMarketplaceOrderStatus()`; read model chính: `apps/worker-api/src/core/orders/read-core.js` với `normalizeOrderReadModel()` và `buildOrderLabelState()`.
- `/api/orders`, `/api/orders/changes`, `/api/core/orders/:orderId`, `/api/core/orders/by-conversation/:conversationId`, Dashboard summary và Export đều trả/đọc `raw_platform_status`, `order_status_core`, `fulfillment_status_core`, `display_status_vi`, `terminal_status`, `label_eligible`, `label_status`, `label_reason`, `label_download_mode`, `label_download_supported`, `label_download_source`, `label_download_reason`, `label_download_read_only`, `label_download_requires_manual`.
- Display status chuẩn: `Chờ xử lý`, `Đã xử lý / sẵn sàng giao`, `Chờ lấy hàng`, `Đang giao`, `Đã giao`, `Đã hủy`, `Hoàn / trả`, `Giao thất bại`, `Lỗi / cần kiểm tra`. Unknown raw status không đoán, trả `Lỗi / cần kiểm tra` và `label_eligible=false`.
- 45 đơn `order_type=return` nhưng `COMPLETED/COMPLETED` được xử lý runtime bằng read model: `order_status_core=RETURN`, `display_status_vi=Hoàn / trả`. Không backfill thật trong phase này, touched `0`.
- OMS frontend, Dashboard order analytics và Chat order-link không còn tự map raw status. Frontend chỉ format từ `display_status_vi/order_status_core/fulfillment_status_core`; `status_raw` chỉ giữ làm dữ liệu gốc nếu backend cần trace.
- `marketplace_shop_capability_core` là nguồn chuẩn capability tải tem: Shopee API đủ token live/shop id -> `api_document_generation_then_download`; Shopee no-API `khogiadungcona` và TikTok `0909128999` -> `local_chrome_retry_label`; Lazada API đủ token live/shop id -> `api_print_awb_read_only`; profile chưa map -> `manual_required`; sàn khác -> `not_supported`.
- Route label thống nhất: `GET /api/labels/status` để đọc, `POST /api/label/:orderId/refresh` để dry-run hoặc tải thủ công một đơn khi `label_status=eligible` và capability read-only cho phép. `POST /api/labels/refresh/*` là legacy 410 và không chạy logic cũ.
- Auto tải tem thật/hàng loạt đã bật có kiểm soát qua `backfillEligibleLabels()` và `POST /api/label/backfill-eligible`; `bulk-oms-status`, webhook marketplace, import/status sync và cron chỉ gọi route chuẩn read-only theo eligibility/batch nhỏ, không tạo job legacy `refresh_label` và không quét toàn bộ đơn mỗi cron.
- Production version: Worker chính `badcbe4b-700f-4348-8af3-a6eed8babe8a`, static UI `fd77a0a3-e5b2-4bdb-a9ed-b691bf6563bd`; OMS production đã kiểm bằng Chrome profile ShopHuyVan ở desktop/tablet/mobile, sample Shopee/TikTok/Lazada/manual/return đọc đúng Core status.

## Cập nhật TikTok Seller Center detail finance 2026-05-19

- TikTok trong hệ thống hiện là fallback Seller Center detail/import/manual, chưa gắn nhãn API order chính thức.
- URL detail chuẩn: `https://seller-vn.tiktok.com/order/detail?order_no=<ORDER_NO>&shop_region=VN`; parser phải kiểm `order_no` trên URL khớp mã đơn trên trang trước khi ghi Warehouse.
- `Tổng cộng` là `gross_revenue` / Tổng doanh thu báo cáo / Người mua thanh toán; `Tổng các mặt hàng sau khi giảm giá` hoặc `Tổng (các) mặt hàng sau khi giảm giá` là `product_revenue_after_shop_discount` / Tiền sản phẩm sau KM shop; `Phí vận chuyển sau khi giảm giá` là `buyer_shipping_paid`; `Số tiền bạn kiếm được` nếu có là Thực nhận ví.
- Nếu trang detail đang thu gọn, parser được bấm `Hiển thị chi tiết` trong khối thanh toán để mở các dòng tiền; đây là thao tác đọc dữ liệu, không phải marketplace write/action.
- Nếu chưa có Thực nhận ví, `actual_income=NULL`, `profit_basis` của TikTok là Tiền sản phẩm sau KM shop, `estimated_income` giữ số dùng tính lãi tạm, `profit_status=estimated_pending_settlement`; phí vận chuyển người mua trả chỉ đối soát doanh thu, không đưa vào lãi tạm tính nếu chưa có settlement/shipping_net.
- Read path Core: Seller Center detail -> `order_fee_details.raw_data.tiktok_seller_center_detail` -> `finance-taxonomy-core` -> `order_analytics` -> OMS/Profit/Dashboard/Export. UI/Export chỉ đổi label tiếng Việt, không đổi tên field Warehouse.
- Backfill path: local parser/runner lấy detail read-only, POST `/api/orders/tiktok-seller-detail/backfill`, route upsert `order_fee_details`, cập nhật metadata `orders_v2.source_detail=tiktok_seller_center_detail`, rebuild analytics không sync Payment live.
- Eligibility batch tối đa 20 đơn: đơn TikTok mới import, thiếu finance detail/revenue components, thiếu actual_income, pending settlement, status mới chuyển giao/hoàn tất, confidence estimated hoặc source manual/import chưa đủ. Không đọc lại đơn đã confirmed và còn mới.
- Guard 2026-05-19: `finance-taxonomy-core` bỏ qua escrow/settlement ước tính cũ nếu `tiktok_seller_center_detail.actual_income_available=false`; `backfill` giữ lại actual confirmed cũ thay vì ghi `NULL` ngược.

## Cập nhật taxonomy phí/doanh thu/lãi 2026-05-19

- Core Finance dùng chung tên gọi cho OMS/Profit/Dashboard/Export: giá niêm yết, giảm giá shop, người mua thanh toán, voucher sàn, phí sàn, thuế/khấu trừ, phí ngoài sàn/ADS, giá vốn, settlement, lãi thực.
- `marketplace_fee_total` chỉ là khoản sàn thu; không nhận `shop_discount`, voucher shop hoặc seller discount.
- `finance_fee_core.components` chỉ chứa phí/thuế/khấu trừ; `discount_components` chứa `Giảm giá của shop`, `Sàn tài trợ / Voucher sàn`, `Combo / khuyến mại khác`.
- Nếu nguồn lãi là `buyer_paid`, công thức không trừ `shop_discount` lần nữa. Nếu nguồn lãi là `actual_income`, công thức không trừ lại phí/voucher đã net trong settlement.
- Các UI/export gom nhiều nhóm dùng nhãn `Tổng khấu trừ`, không dùng `Tổng Phí Sàn`.
- OMS popup phí có state pinned theo order, click outside/ESC đóng, re-render giữ popup nếu order còn và tự đóng khi order biến mất.
- `%` phí/khấu trừ mặc định tính trên `Người mua thanh toán`; không đủ basis thì hiển thị `—`.
- Lượt này không rebuild Payment live và không gọi sync Payment live.
- Production deploy: Worker chính `cc96348c-ebcb-441a-852e-03be377435eb`, static UI `1e47c9f4-14ab-48bc-9c16-406d42296b02`; Finance Core rebuild với `sync_payment=false`.

## Cập nhật Core route mở Chat từ OMS 2026-05-19

- Route đọc mới của Worker chính: `GET /api/core/orders/:orderId/chat-target`.
- Core nằm ở `apps/worker-api/src/core/shared-data/order-chat-target-core.js`, đọc `getCoreOrder()` và `getCoreShopSummary()` để trả một `chat_target` thống nhất cho OMS.
- `chat_target` gồm `order_id`, `platform/channel`, `shop_id`, `shop_display_name`, `customer_id`, `shop_chat_mode`, `send_capability`, `sync_capability`, `open_chat_allowed`, `conversation_resolution` và `reason`.
- OMS chỉ dùng route này để mở `chat-cskh.html` bằng context đơn hàng; không gọi `/api/chat/resolve-order-conversation` và không dùng bảng Chat legacy.
- Conversation thật vẫn thuộc Chat Worker `/api/chat/conversations`; Chat UI mới tự tìm bằng `shop_id + customer_id`, nếu không thấy thì vẫn đọc Order/Product Core theo `order_id`.
- Shopee có Chat API/bridge được mở Chat mới; Shopee chưa bật Chat API, Lazada, TikTok và manual/import trả reason rõ để UI không ẩn nút im lặng.

## Cập nhật Product Core cho Chat mới 2026-05-19

Hotfix này bổ sung lại tab `Sản phẩm` cho Chat/CSKH mới nhưng vẫn giữ nguyên ranh giới Core: Chat Worker quản hội thoại/tin nhắn, Worker chính quản Shop/Product/Order/Finance Core.

- Route đọc mới của Worker chính: `GET /api/core/products/search` trong `apps/worker-api/src/routes/core-data/index.js`, đọc `searchCoreProducts()` tại `apps/worker-api/src/core/shared-data/core-data-core.js`.
- Search gom ba nguồn theo thứ tự Core: Product Master `products`, mapping shop/sàn `product_variations`, rồi Product Knowledge `marketplace_product_knowledge`; kết quả chuẩn hóa thành `sku`, `name`, `image_url`, `price`, `stock`, `platform_product_id`, `platform_variation_id`, `source`, `confidence`, `badge`, `updated_at`.
- `GET /api/core/products/by-sku/:sku` vẫn là route kiểm SKU chính trước khi gửi card; Chat Worker không tin dữ liệu frontend nếu Product Core không xác nhận.
- Order context -> product context đi qua `GET /api/core/orders/by-conversation/:conversationId`; `normalizeOrderItem()` trả thêm `platform_product_id`, `platform_variation_id`, `platform`, `shop`, `shop_id` từ Product Master/variation để tab `Sản phẩm` ưu tiên sản phẩm trong đơn.
- Product card không đi qua Worker chính `/api/chat/*`. Route gửi nằm ở Chat Worker `POST /api/chat/product-cards/send`, sau đó bridge nội bộ mới gọi `POST /api/internal/chat-bridge/shopee/messages/product-card`.
- Shopee bridge product card dùng SellerChat `send_message` với thử `message_type=item` rồi `message_type=product`; `dry_run=true` chỉ trả payload/attempts và không gửi live.
- Lazada/TikTok/manual chưa có Chat/Product Card API trong hệ thống thì Core vẫn cho xem sản phẩm, nhưng action gửi card disabled/unsupported với reason rõ. Không fallback gửi text nếu người dùng chọn product card.
- Các module legacy `fe-chat-marketplace` và `worker-chat-marketplace` không được restore; mọi ghi chú cũ về product catalog/advisory legacy chỉ còn giá trị tham khảo lịch sử.
- Deploy/verify hotfix: Worker chính `3a8ad03b-a557-4d0c-a149-d60445665e2f`, Chat Worker `76fc53b2-e0df-4c8d-9f2b-d1e974a8c42b`, static UI `54d8476a-bf9e-4a45-8a6e-49520110f49e`.
- Production checks pass: `/api/core/products/search?q=HV999K241300S&platform=shopee` trả sản phẩm có `platform_product_id=24066761868`; `POST /api/chat/product-cards/send` với `dry_run=true` trả `sent_to_platform=false`; manual shop trả `manual_send_required`.
- Browser production pass desktop/tablet/mobile bằng profile `E:\codex-chrome-profiles\shophuyvan-test`; Network không có `fe-chat-marketplace` và không gọi Worker chính `/api/chat/context` hoặc `/api/chat/conversations`.

## Cập nhật xóa/cắt Chat legacy 2026-05-19

Lượt này chỉ cắt Chat legacy; các Core Shop/Product/Order/Finance giữ nguyên vai trò nguồn chuẩn.

- Frontend cũ `chat-marketplace.html`, `chat-marketplace-page.js`, `fe-chat-marketplace-loader.js` và toàn bộ `fe-chat-marketplace/*` đã xóa khỏi runtime. Không còn trang production nào được phép load `fe-chat-marketplace`.
- Link dashboard/profit/reviews/Zalo/landing và service worker đã chuyển sang `chat-cskh.html`; OMS đã bỏ nút/caller legacy mở `/api/chat/resolve-order-conversation`.
- Chat mới vẫn dùng Chat Worker riêng cho conversation/message qua `/api/chat/*` trên domain `shophuyvan-chat-api`; đây không phải `/api/chat/*` legacy của Worker chính.
- Worker chính giữ `/api/chat/*` cũ ở trạng thái 410 `legacy_chat_route_disabled`, không mutate dữ liệu và không fallback logic cũ.
- Worker chính chỉ giữ bridge nội bộ Chat mới ở `/api/internal/chat-bridge/shopee/sync` và `/api/internal/chat-bridge/shopee/messages/send`; bridge này không ghi bảng Chat legacy và không enrich order/product/finance riêng.
- `/api/internal/chat-bridge/shopee/conversations*` trả 410 `legacy_bridge_read_disabled` vì list/messages phải đi qua Chat Worker/Core mới.
- Product knowledge sync đã chuyển sang `core/products/product-knowledge-core.js`; API sync Product không còn import `routes/worker-chat-marketplace`.
- Đã xóa backend legacy `routes/worker-chat-marketplace/*` và `core/chat/*`; helper đi vòng Core không còn runtime.
- Auth/disconnect Lazada Chat legacy đã bị disable 410: `legacy_chat_auth_disabled` và `legacy_chat_disconnect_disabled`.

Các ghi chú lịch sử phía dưới về việc "giữ legacy vì còn caller" chỉ còn giá trị tham khảo trước cleanup này.

Deploy/verify production của lượt này:

- Worker chính `huyvan-worker-api`: `04e42159-a24d-49e9-9e6e-eaea13b7c59b`.
- Static UI `shophuyvan-analytics`: `8c3807de-197a-4daa-81e1-3eb1ac697990`.
- `/api/core/shops` pass cho Shopee API/manual, Lazada API và TikTok manual/reference; TikTok `0909128999` vẫn `manual_reference/manual_import`, không bị gắn API giả.
- `/api/core/products/by-sku/HV999K241300S` pass HTTP 200; Chat order-link gọi `/api/core/orders/by-conversation/*` từ production UI và trả dữ liệu đơn Core khi hội thoại có order id.
- Finance Core `2026-05-18` pass `status=ok`; duplicate exact `order_items` production bằng truy vấn D1 read-only còn `0`.

## Cập nhật tổng vệ sinh runtime đọc dữ liệu 2026-05-19

Lượt này khóa lại các runtime đọc dữ liệu, không tạo source mới và không làm lại các Core đã pass.

Deploy/verify production:

- Worker chính: `5758ca3f-b27d-4c73-bfc1-bbd1885e21f0`; static UI: `697c6142-e9c4-465f-8beb-12b5923616d9`.
- Finance Core ngày `2026-05-18` rebuild với `sync_payment=false`, kết quả `status=ok`, `orders=68`, `gross_revenue=7.624.224đ`.
- Dashboard cùng ngày đọc `order_finance_core`, không quay lại số legacy `13.994.100đ`.
- Export sample ngày `2026-05-18` có `finance_source/finance_confidence`; TikTok order `584090485281163170` đọc `order_analytics` với confidence `estimated`.
- Auto scan diagnostic: Shopee/Lazada API shop hiện `API`; `khogiadungcona` và TikTok `0909128999` hiện `Manual/manual_reference`.
- Browser profile `E:\codex-chrome-profiles\shophuyvan-test` pass desktop/tablet/mobile cho Profit Dashboard sau khi cắt loader Chat legacy.

- Chat mới: `chat-cskh.html` đọc conversation từ Chat Worker, còn Shop/Product/Order/Finance đọc Worker chính qua `/api/core/*`. `order-link.js` tiếp tục gọi `/api/core/orders/by-conversation/*`.
- Chat legacy Worker chính: `/api/chat/context`, display-card enrich và resolver không còn runtime; `/api/chat/*` trả 410 `legacy_chat_route_disabled`.
- OMS: `/api/orders` vẫn là public wrapper cho list/detail nhưng row trả ra phải qua Order Core read model, `order_status_core` và fee core. UI OMS không được tự quyết định loại/trạng thái đơn từ raw text nếu response đã có core fields.
- Dashboard/Profit: tổng KPI, shop breakdown, profit/revenue by day và top chart đọc Finance Core/`order_analytics`. Không trộn tổng Finance Core với breakdown `orders_v2`; khi Core stale phải trả marker stale.
- Export: order/item metadata đọc `orders_v2/order_items`, số tài chính đọc `order_analytics` và bắt buộc có `finance_source`, `finance_confidence`. Fallback legacy chỉ được xuất với marker rõ.
- Product: Product Master vẫn là `products/product_variations`; Chat/OMS chỉ được enrich product từ nguồn này hoặc từ item snapshot của đơn, không tạo mapping product riêng.
- Auto scan diagnostic: mode/capability đọc `marketplace_shop_capability_core` và source metadata; shop không API không được hiện API, TikTok `0909128999` giữ manual/reference nếu chưa có API order/token.

Legacy đã cắt khỏi runtime lượt này:

- `profit-dashboard.html` không còn nạp `fe-chat-marketplace-loader.js`; Chat legacy chỉ còn ở trang Chat riêng và các route có caller thực tế.
- Shop public display helper chặn raw Shopee/Lazada ID và `Shopee <id>` khi có hoặc chưa có tên Core hợp lệ; TikTok manual label không bị xóa nhầm.

Legacy còn giữ:

- `chat-marketplace.html`, `fe-chat-marketplace/*`, `worker-chat-marketplace/*`, `core/chat/*`: đã xóa. `/api/chat/*` Worker chính trả 410; `/api/chat/*` Chat Worker riêng là hệ mới.
- `recalcCost()` và Income routes: còn write-path/source-acquisition/readback, không phải runtime báo cáo thay Finance Core.
- Route 410 `/api/orders/archive-old` và `/api/fix-shop-names`: giữ để caller cũ nhận lỗi explicit thay vì mutate dữ liệu legacy.

## Cập nhật Shop Profile Core 2026-05-18

- Endpoint Shopee Open Platform đã xác minh bằng Chrome profile `E:\codex-chrome-profiles\shophuyvan-test`: `GET /api/v2/shop/get_shop_info` trong module `Shop`, API name `v2.shop.get_shop_info`. Endpoint bổ sung để lấy logo/mô tả: `GET /api/v2/shop/get_profile`, API name `v2.shop.get_profile`.
- Field dùng làm tên hiển thị chuẩn: `shop_name`. `get_shop_info` trả `shop_name`, `region`, `status`; `get_profile` trả `response.shop_name`, `response.shop_logo`, `response.description`.
- Snapshot Shop Core mới: `shop_core_profiles`, khóa `(platform, shop_id)`, lưu `shop_display_name`, `shop_name_source`, `shop_profile_source`, `source`, `confidence`, `shop_logo`, `region`, `status`, `raw_profile`, `updated_at`.
- Route sync đọc an toàn: `GET /api/shops/shopee-profile-sync?shop_id=<api_shop_id>` hoặc `?shop=<alias>`. Route này chỉ gọi endpoint Shop đọc, không gọi endpoint ghi và không gửi tin live.
- `/api/core/shops` và `/api/core/shops/:shopId/summary` enrich từ `shop_core_profiles`. UI phải dùng `shop_display_name`; nếu thiếu tên thật thì hiện `Shop chưa đồng bộ tên`, không dùng raw numeric shop id làm tên chính.
- Guard runtime mới bỏ qua mọi tên dạng raw numeric, `Shopee <id>` hoặc trùng `api_shop_id`; những giá trị này chỉ còn là technical id để query/sync, không làm display name.
- Bản đồ Warehouse chi tiết của lượt này: `docs/warehouse-core-map.md`.
- Nguyên nhân cũ của `Shopee · 170044686` và `Shopee · 166563639`: Chat Worker chỉ có `chat_conversations.shop_id`, còn Shop Core chưa trả `shop_display_name`; route snapshot cũ cũng hiểu query `shop_id` là khóa nội bộ `shops.id` nên không sync được theo `api_shop_id`.
- Production 2026-05-18 đã sync Shop API chính thức:
  - `170044686`: `shop_display_name=GIA DỤNG HUY VÂN`, `shop_name_source=shopee_shop_api`, `source=API`, `confidence=confirmed`, `status=NORMAL`, `region=VN`.
  - `166563639`: `shop_display_name=shophuyvan.vn`, `shop_name_source=shopee_shop_api`, `source=API`, `confidence=confirmed`, `status=NORMAL`, `region=VN`.
- Deploy liên quan lượt Shop Profile: Worker chính `huyvan-worker-api` version `d8e7ae88-a31e-4e2c-8b71-3a95bb4872b3`, Chat Worker `shophuyvan-chat-api` version `ff2d5b00-9bdb-4f6e-be0f-9825a95875af`, static UI `shophuyvan-analytics` version `06d47676-37f9-4a24-a704-646f67e683ae`.

## Cập nhật Finance Warehouse/Core 2026-05-18

- Shop Warehouse giữ nguyên trạng thái pass; Product Warehouse đã có Product Master và không refactor trong lượt này.
- Finance Core nguồn chuẩn hiện nằm ở `order_analytics` + `order_fee_details` + `marketplace_order_finance_daily_snapshots`, đọc qua `loadOrderFinanceCore()` trong `apps/worker-api/src/core/orders/finance-core.js`.
- Finance snapshot ghi marker công thức trong `source_json`: `calc_version=finance-core-revenue-basis-max-v20260518`, row đầy đủ có `source_marker=order_analytics.finance_core`.
- `loadOrderFinanceCore()` phải kiểm stale trước khi coi snapshot hợp lệ: thiếu `calc_version`, version cũ, row do payment-sync partial, orphan row, thiếu row so với `orders_v2` normal hoặc `order_analytics.revenue` lệch công thức `max(orders_v2.revenue, sum(order_items.revenue_line), marketplace finance revenue basis)` đều trả `status=stale`.
- `rebuildOrderAnalytics()` phải dọn row `order_analytics` cũ không còn khớp `orders_v2.order_type='normal'` trong phạm vi rebuild, tránh đơn đã chuyển hủy/hoàn tiếp tục nằm trong snapshot tài chính.
- Khi Finance Core stale, API phải trả `snapshot_health.stale_reasons` và `action=rebuild_order_analytics_without_live_payment_sync`; không được silently dùng số bẩn cho KPI.
- `/api/profit-by-day` trước đây tự gom `orders_v2` + return ledger; sau sửa chỉ đọc `loadOrderFinanceCore().by_day`.
- `/api/revenue-by-day` trước đây đọc `orders_v2.revenue`; sau sửa đọc `gross_revenue` từ `order_analytics` qua Finance Core.
- `/api/dashboard` trước đây trả tổng doanh thu/lãi từ SQL riêng trên `orders_v2`; sau sửa trả thêm `order_finance_core` và lấy doanh thu/lãi chính từ `order_finance_core.summary`, còn fee bucket đọc `dashboard_finance_fee_core`.
- `/api/dashboard.shop_breakdown` phải dùng cùng `order_finance_core.by_shop` cho doanh thu theo shop khi `status=ok`; `orders_v2` chỉ còn là dòng tham chiếu `shop_import_revenue` và đếm trạng thái. Nếu Finance Core stale, Dashboard không được trộn tổng Core với breakdown `orders_v2`.
- `/api/top-sku`, `/api/top-product`, `/api/top-shop`, `/api/top-platform`, `/api/top-sku-full` trước đây dùng `orders_v2.profit_real`; sau sửa đọc `order_analytics.net_profit` và phân bổ item theo tỷ lệ doanh thu dòng.
- `/api/export-orders` trước đây tự phân bổ fee/profit từ các cột legacy `orders_v2.fee_*`; sau sửa đọc `order_analytics`, xuất thêm `finance_source`, `finance_confidence`, `finance_income_source`.
- `/api/income/*` giữ lại vì là đường lấy/đối soát nguồn Payment/Finance/payout/report, không phải báo cáo lịch sử thay Finance Core.
- Deploy/verify: Worker chính `3605a561-cb25-41eb-be05-25234e1a961b`, static UI `c5da67a2-c3f4-4e9b-8fed-93515743d3a0`; production API Finance/Profit/Dashboard/Export HTTP 200; Chrome profile `E:\codex-chrome-profiles\shophuyvan-test` pass desktop/tablet/mobile.
- Deploy guard chống stale snapshot: Worker chính `a5dcbf28-189f-4bf4-8c38-ddfe7477dbe6`; rebuild production ngày `2026-05-18` không sync Payment live, kết quả `67` đơn hợp lệ, `4` đơn hủy, `deleted_stale=1`, Finance Core và Dashboard cùng trả `7.514.224đ`.

## Cập nhật Order Warehouse/Core 2026-05-19

- Shop Warehouse giữ trạng thái pass; Product Warehouse đã có Product Master; Finance Warehouse/Core đã có `calc_version` snapshot guard. Lượt này chỉ cleanup Order runtime.
- Order Warehouse/Core nguồn chuẩn hiện có: `orders_v2`, `order_items`, `order_fee_details`; khi cần số tài chính chuẩn thì đọc `order_analytics` qua Finance Core.
- Read helper mới: `apps/worker-api/src/core/orders/read-core.js`, gom `platform_order_id`, `shop_id`, `buyer_name`, `buyer_user_id`, `status_raw`, `status_label_vi`, `status_kind`, `status_parent`, `order_status_core`, `order_type`, `source`, `confidence`, `badge`, `updated_at`, `raw_source`.
- `/api/core/orders/:orderId` và `/api/core/orders/by-conversation/:conversationId` dùng lại helper Order read-core trong `core-data-core`, nên Chat mới và các consumer core không tự map status/source riêng.
- `/api/orders` vẫn là runtime chính của OMS order list/detail, nhưng sau cleanup mỗi row được normalize qua `normalizeOrderListRowForCore()` rồi mới trả về UI. Route này vẫn đọc Warehouse tables, không tạo nguồn order thứ hai.
- `/api/orders/changes` cũng trả row có metadata Order Core để tab notification/API không tự hiểu trạng thái từ raw text.
- Dashboard order/status không đổi code vì đã đọc `orders_v2` + `order_status_core`; Finance guard vẫn giữ nguyên cho doanh thu/lãi.
- Export order không đổi code vì metadata order lấy từ `orders_v2/order_items`, còn số tài chính đọc `order_analytics` và có `finance_source/confidence`.
- Chat dùng hướng mới: `apps/fe/js/dashboard/chat/order-link.js` đọc `/api/core/orders/by-conversation/*`; không refactor legacy `worker-chat-marketplace` trong lượt này.
- Legacy Order đã cắt khỏi runtime: `POST /api/orders/archive-old` và `GET /api/fix-shop-names` nay trả `410`, không còn mutate `orders_v2`.
- Legacy còn lại chưa xoá: `POST /api/orders/bulk-delete` vì là tool bảo trì xoá đơn lỗi có chủ đích; `GET /api/orders/debug-status` vì read-only audit; `recalcCost()` vì còn write-path bảo trì cost/profit.

## Cập nhật duplicate order_items legacy 2026-05-19

- `order_items` không có unique constraint legacy nên cleanup không tạo migration khóa cứng khi dữ liệu cũ chưa được rule hóa toàn bộ.
- Canonical key vận hành: `platform` từ `orders_v2` + `order_id` + `sku` + `variation_name` + `product_name` + `image_url` + `qty` + `revenue_line` + `cost_real` + `cost_invoice` + `original_price` + `sale_price` + `current_price` + `price_source` + `reservation_id`.
- Guard chống tái phát: `cleanupDuplicateOrderItemsForOrders()` trong `apps/worker-api/src/routes/orders/order-items-dedupe.js`, gọi bởi `importOrdersV2()` sau khi ghi item. Nếu dedupe lỗi thì import trả lỗi, không báo thành công giả.
- Cleanup legacy production: backup `18` row vào `order_items_dedupe_backup_20260519`, xóa `18` row duplicate exact, exact duplicate count sau cleanup là `0`.
- Các nhóm cùng SKU nhưng khác identity/amount còn giữ lại; không merge nếu chưa có rule chứng minh là duplicate thật. Nhóm mẫu giữ lại: `2605102FQYD1TW` / `DAYVOISENTOTK231`.
- Sau cleanup đã rebuild Finance/Core range `2026-05-02..2026-05-13` với `sync_payment=false`. Product/Top SKU/Export đọc lại từ `order_items` và `order_analytics`, không vá UI riêng.

## Cập nhật Order auto scan 2026-05-19

- Cron/scheduled handler của Worker chính ở `apps/worker-api/src/index.js`; `wrangler.toml` deploy cron `*/5 * * * *` và `0 0 * * *`.
- Auto scan order theo capability:
  - Shopee/Lazada có API: `/api/orders/sync-api-orders` và `/api/orders/sync-api-statuses` gọi API chính thức theo batch nhẹ, rồi upsert `orders_v2`, `order_items`, `order_fee_details` nếu có.
  - Shopee không API: không gọi API giả; chỉ nhận browser/import/manual có log qua `importOrdersV2()` và ghi source `browser_sync`, `import_file_sync` hoặc `manual_reference`.
  - TikTok: chưa có order API/token chính thức trong hệ thống; dữ liệu hiện là fallback local helper/import/manual vào Order Warehouse, không được gắn nhãn `đồng bộ API`.
- `marketplace_shop_capability_core` trả thêm `order_sync_mode`, `order_sync_mode_label`, `order_sync_source_label`, `last_order_source_at`, `last_order_source_orders_7d`, `last_order_source_touched_24h`. UI phải đọc các field này, không tự đoán từ tên sàn.
- Runner diagnostic đi cùng capability: `order_runner_type`, `order_runner_name`, `order_runner_schedule`, `order_runner_running_source`, `order_runner_status_label`. Shopee/Lazada API dùng Worker cron; TikTok/manual/import/browser dùng local helper health và phải hiện `Chưa có runner tự động` nếu helper/report_worker không chạy.
- Local `report_worker` là `run_report_jobs.py --watch`, chỉ nhận job report pending từ `/api/jobs` rồi import vào Order Warehouse; không phải TikTok API giả và không tự sync Payment.
- `modules/api-sync/sync-diagnostics.js` có `recordImportedOrderSyncDiagnostics()` để luồng import/fallback cập nhật `shops.last_order_sync_*`, tránh trạng thái shop không API bị im lặng dù có đơn mới.
- Cron status Shopee nền tắt `fetch_fees` và `fetch_tracking`; không sync Payment live trong lượt nền, không làm yếu Finance snapshot guard.
- Finance stale guard vẫn dựa vào chênh giữa `orders_v2` normal và `order_analytics`; ngày `2026-05-18` thiếu row TikTok `584090485281163170` nên phải rebuild `order_analytics` bằng core hiện tại, không fake số.

## Phạm vi lượt này

- Ưu tiên Shopee.
- Không tạo hệ sản phẩm hoặc đơn hàng riêng cho Chat.
- Không fake API data: shop có API đọc API/snapshot; shop chưa API đọc import/manual/cost setting và phải hiện badge rõ.
- Mục tiêu bước đầu là endpoint đọc chung để Chat/OMS/Product/Profit có cùng nguồn tra cứu.

## Hiện trạng sau audit Warehouse 2026-05-18

| Nhóm dữ liệu | Nguồn D1 hiện có | Core/helper hiện có | Endpoint đang đọc | Rủi ro lệch |
|---|---|---|---|---|
| Shop/store/platform | `shops`, `shop_core_profiles` | `shop-capability-core`, `shopee-profile-core`, Chat Worker `shop-display-core` | `/api/core/shops`, `/api/core/shops/:shopId/summary`, `/api/chat/conversations` trên Chat Worker | Shop display đã qua Warehouse; frontend Chat legacy đã xóa. |
| Order sync/status/detail | `orders_v2`, `order_items`, `order_fee_details` | `order_status_core`, `order_transport_core`, `fee-phase1-core`, `read-core`, `core-data-core` | `/api/orders`, `/api/core/orders/:orderId`, `/api/core/orders/by-conversation/:conversationId` | Order Core có; OMS vẫn dùng route public `/api/orders` nhưng row đã qua `normalizeOrderListRowForCore()`, route chỉ đọc Warehouse tables và core status/fee. |
| Product/SKU/stock/price | `products`, `product_variations`, `marketplace_product_catalog_snapshots`, `marketplace_product_shop_catalog_state` | `product_catalog_core`, `sku_identity_core`, `inventory_stock_core` | `/api/products`, `/api/core/products/by-sku/:sku`, `/api/products/catalog-overview` | Product Master là Warehouse nguồn chính; Product page đọc route Product Master trực tiếp, không làm lại trong lượt này. |
| Finance/fee | `order_fee_details`, `orders_v2`, `order_analytics`, `marketplace_order_finance_daily_snapshots`, cost settings | `fee-phase1-core`, `order_finance_core`, `dashboard_finance_fee_core`, `calcProfit` wrapper gọi core | `/api/orders`, `/api/order-analytics/finance-core`, `/api/dashboard`, `/api/profit-by-day`, `/api/revenue-by-day`, `/api/export-orders`, `/api/income` | Profit/Dashboard/Export read-path đã chuyển về Finance Core; Income còn giữ source-acquisition/readback. |
| Chat order card/shop panel | `chat_conversations`, `chat_messages` trong Chat Worker; Worker chính đọc Order/Product Core | Chat Worker capability/display core; UI mới `order-link.js` | `/api/chat/conversations`, `/api/chat/conversations/:id/messages` trên Chat Worker, `/api/core/orders/by-conversation/*` trên Worker chính | UI mới đọc Order/Product/Shop Core; legacy frontend/backend đã xóa hoặc 410. |
| OMS order detail | `orders_v2`, `order_items`, `order_fee_details` | `status-workflow`, `fee-phase1-core`, `order_transport_core` | `/api/orders` | Đã đọc core phí/status; chưa đổi sang `/api/core/*` vì `/api/orders` là runtime chính. |
| Dashboard/Profit/Product | `orders_v2`, `order_items`, `products`, `product_variations`, `order_fee_details`, snapshots | dashboard routes, Product Master route, order analytics finance core | `/api/dashboard`, `/api/products`, `/api/order-analytics/*` | Có core nguồn, còn formatter UI và route chuyên biệt cần gom dần. |

## Endpoint đọc chung đã thêm

Worker chính `huyvan-worker-api` có route đọc an toàn. Deploy mới nhất đã ghi trong phần Shop Profile ở đầu file; không deploy Worker trong lượt audit/cleanup display legacy này.

| Endpoint | Nguồn đọc | Mục đích |
|---|---|---|
| `GET /api/core/health` | route core | Kiểm route đọc chung đang bật. |
| `GET /api/core/shops?platform=shopee` | `shops` + count từ `orders_v2`, `product_variations`, `marketplace_product_catalog_snapshots`, `order_fee_details` | Trả Shop Core gồm capability API/chat/order/product/finance. |
| `GET /api/core/shops/:shopId/summary` | Shop Core | Trả một shop để Chat/OMS dùng cùng capability. |
| `GET /api/core/orders/:orderId` | `orders_v2`, `order_items`, `order_fee_details`, `products`, `product_variations` | Trả Order Core có `status_label_vi`, items, amounts, finance field có metadata nguồn. |
| `GET /api/core/orders/by-conversation/:conversationId` | Order Core + Shop Core | Nối Chat conversation với đơn thật bằng mã đơn hoặc buyer identity, không gọi API sàn trực tiếp. |
| `GET /api/core/products/by-sku/:sku` | `products`, `product_variations` | Trả Product Master Core theo SKU, ưu tiên `products` và enrich snapshot sàn. |

## Contract badge nguồn dữ liệu

Mọi response core trả `badge` ở một trong các giá trị:

- `API`: dữ liệu đến từ API/snapshot đã xác nhận.
- `Snapshot`: dữ liệu đọc từ D1 snapshot/core.
- `Fallback`: dữ liệu import/manual/cost setting.
- `Estimated`: dữ liệu ước tính có kiểm soát.
- `Missing`: thiếu dữ liệu, UI không tự đoán.

Shop chưa API phải hiển thị `Shop chưa có API`, `Dữ liệu tham chiếu`, `Manual import` hoặc `Cost setting`.

## Chỗ frontend còn tự format/tự map riêng

- Chat UI mới vẫn format tiền và badge ở frontend, nhưng không tự tính fee/profit/status; status/amount/source lấy từ `/api/core/*`.
- OMS frontend vẫn render nhiều trạng thái từ `/api/orders`; backend `/api/orders` đã dùng `order_status_core` và `fee-phase1-core`.
- Product page đọc `/api/products`, đây là route Product Master trên bảng `products/product_variations`; không coi là đi vòng Warehouse nếu không tự tạo nguồn sản phẩm riêng.
- Dashboard/Profit frontend vẫn format tiền/chart, nhưng các route revenue/profit/top chart đã đọc `order_analytics` qua Finance Core; frontend không tự suy luận phí/lãi.
- Export frontend chỉ xuất CSV từ `data` API và nguồn Finance, không tự tính phí/lãi.
- Legacy Chat `fe-chat-marketplace` đã xóa khỏi repo/runtime; các field `shop/shop_id/api_shop_id` còn lại chỉ là tham số kỹ thuật trong Chat mới/Core hoặc docs lịch sử.

## Quy tắc nối tiếp

1. Không tạo bảng Chat product/order riêng.
2. Nếu cùng đơn/SKU lệch giữa Chat và OMS/Product, sửa `core-data-core` hoặc core gốc trước.
3. Các route ghi/sync vẫn dùng route hiện có (`/api/orders/sync-api-orders`, `/api/products/sync-api-products`); `/api/core/*` chỉ đọc.
4. Lazada/TikTok/Facebook/Zalo không nằm trong scope lượt này.

## Finance Taxonomy 2026-05-19

- Finance/Fee Core thêm contract chuẩn: `gross_revenue`, `product_revenue_after_shop_discount`, `buyer_shipping_paid`, `buyer_total_paid`, `platform_voucher_total`, `seller_cofunded_voucher_amount`, `platform_funded_voucher_amount`, `actual_income`, `marketplace_fee_total`, `tax_total`, `ads_fee_total`, `piship_fee`, `ops_cost_setting_total`, `cost`, `profit`, `finance_source`, `finance_confidence`.
- `seller_cofunded_voucher_amount` chỉ confirmed khi có raw/API/report field, ví dụ `order_income.voucher_from_seller`; `platform_funded_voucher_amount` không được trừ vào shop.
- PiShip là phí vận hành ngoài ví. Nếu Payment API có `shipping_seller_protection_fee_amount`, UI/export hiển thị PiShip từ API và không lấy lại Cost Setting.
- Profit dùng `actual_income` thì không trừ lại seller cofunded voucher, phí sàn hoặc thuế; chỉ trừ vốn, ADS, PiShip và cost setting ngoài ví.

## Kiểm production 2026-05-18

- Shop API kiểm: `chihuy1984`.
- Shop chưa API kiểm: `khogiadungcona`.
- Sync order Shopee hẹp: pass `fetched=2`, `imported_orders=2`, `saved_fee_details=2`.
- Sync product Shopee hẹp: pass `fetched_products=1`, `synced_products=1`, `synced_variations=4`.
- Order đối chiếu: `260518QJM5HP6U` có `LOGISTICS_PENDING_ARRANGE` ở OMS API và Order Core, label core `chờ lấy hàng`.
- SKU đối chiếu: `HV999K241300S` khớp tên và tồn `34` giữa Product Master API và Product Core.
- Chat UI production pass desktop/tablet/mobile bằng Chrome profile `E:\codex-chrome-profiles\shophuyvan-test`.
## OMS/Core Hotfix 2026-05-20

- OMS operational panel `Đồng bộ & tải lại` uses Warehouse/Core routes only: `POST /api/label/retry-failed` for label retry and `POST /api/orders/manual-sync/backfill` for TikTok/Shopee no-API detail backfill. Operators must dry-run by date/shop/platform before a real small batch.
- `order_sync_completeness` is the canonical row result for OMS: API rows with enough status/tracking/label/finance show `Đã đồng bộ`; label failures show `Lỗi tải tem`; finance gaps show `Thiếu dữ liệu tài chính`; TikTok pending settlement shows `Chờ ví TikTok`; Shopee no-API missing detail URL shows `Cần đồng bộ Seller Center`.
- Tracking Core persists `order_tracking_core` and is read through `GET /api/logistics-watch/detail`. Shopee API source is `/api/v2/logistics/get_tracking_info`; Lazada API source is `/logistic/order/trace`; missing permission is surfaced as `api_permission_missing`.
- Lazada API finance source is `/finance/transaction/details/get` with account/payout support from `/finance/transaction/accountTransactions/query` and `/finance/payout/status/get`. Cost setting can remain only as fallback/operating cost, not confirmed API fee for `kinhdoanhonlinegiasoc@gmail.com`.
- Home routing: `Quét mã` -> `scan-qr.html` for packed/cancel/return QR; `Ghi hình` -> `cctv_packing.html` for packing CCTV/video.

## OMS/Core follow-up 2026-05-20

- TikTok pending settlement contract: `actual_income=null`, `actual_income_available=false`, `actual_income_confidence=none`, `settlement_status=pending_settlement`, `estimated_income_source=tiktok_estimated_fee` hoặc `cost_setting_estimate`. OMS hiển thị `Thực nhận tạm tính` và `Lãi tạm tính`, không gọi là `Thực nhận ví` cho tới khi có settlement confirmed.
- Tracking Core response giữ cached `tracking_events` nếu API lỗi/thiếu quyền, nên drawer không còn vừa có events vừa hiện `Chưa có lịch trình vận chuyển`.
- Lazada Chat từ OMS đi Chat Worker/bridge khi shop có capability API. Endpoint IM được dùng: `/im/session/list`, `/im/message/list`, `/im/message/send`; thiếu token/quyền ghi `token_scope_missing` hoặc `api_permission_missing`.
- Lazada Finance source chuẩn là `lazada.finance.transaction.details.get`; UI/Analytics không dùng source singular cũ.

## OMS read/cache contract 2026-05-20

- `/api/orders` là read path production của OMS nhưng phải giữ list nhẹ: chỉ summary order/item/customer/status/finance/label/tracking, không trả raw payload nặng.
- Chi tiết phí/tracking/chat tiếp tục mở theo tương tác riêng; popup phí render từ Finance Core summary/breakdown đã chuẩn hóa.
- Header observability bắt buộc cho OMS list: `X-OMS-Query-Ms`, `X-OMS-Query-Count`, `X-OMS-Data-Source`, `X-OMS-Cache`.
- Sidebar count dùng cache/read nhẹ; không được count toàn DB liên tục khi đổi tab/filter.
- Nếu cleanup dirty data chưa chắc chắn, chỉ dry-run và ghi vào `docs/PROJECT-CURRENT-STATE.md`; không xoá dữ liệu đơn hàng thật.

## Dirty data and chat-target contract 2026-05-20

- `order_items` chỉ chứa sản phẩm thật. Return/refund labels như `Mã yêu cầu trả hàng` phải đi vào marker/return state; missing detail labels như `Thiếu chi tiết sản phẩm` phải đi vào `item_data_status=item_missing`.
- `/api/orders` summary được phép trả marker/status để UI báo lỗi dữ liệu, nhưng không được trả marker như product name, SKU, hoặc SKU mapping candidate.
- Product/SKU temporary codes `SP_` are not default mapping suggestions unless `include_temp=1`. Placeholder rows must carry hidden/type metadata instead of being treated as confirmed Product Master.
- `/api/core/orders/:orderId/chat-target` is the lightweight order-to-chat source. It must return only platform/shop/order/buyer/conversation target plus `source`, `confidence`, and `missing_fields`; it must not scan the full orders table or pull raw payload.
- Chat send result must come from Chat Worker/Core bridge. Frontend toast is not evidence of success; UI should display `sent`, `failed`, `manual_pending`, `message_id`, and the real error code from the bridge.
- Terminal finance status belongs in Finance Core: canceled orders are `canceled_excluded`, return/refund pending orders are `return_pending`, and TikTok estimate net must reconcile with fee rows.

## 2026-05-20 follow-up: Chat target, runner, tracking read model

- `/api/core/orders/:orderId/chat-target` is the OMS source of truth for opening Chat from an order. Lazada resolves official session/conversation from `marketplace_chat_conversations` synced IM data; it must not create a second chat target cache or scan all `orders_v2`.
- Lazada sample PASS: order `527394116390561`, shop `200166591213` / `lazada:200166591213`, conversation `200013190561_1_200166591213_2_103`, source `marketplace_chat_conversations:api:order_message_card`.
- TikTok chat sample `584104642942568017` remains manual/adapter-not-configured until TikTok Chat adapter/token scope is added; do not label it API pass.
- Auto runner state is execution-based: queued is not enough. TikTok job `1102` reached running then failed `runner_requires_login`; Shopee no-API job `1103` reached running then completed with 0 update due missing `seller_center_detail_url`.
- Tracking summary in `/api/orders` reads API timeline summary from Tracking Core only; full events stay lazy-loaded through `/api/logistics-watch/detail`.
- If a Tracking Core row has API events, old batch/retry error text must stay diagnostic and must not override `tracking_data_status=ok` / OMS row status.

## Cập nhật 2026-05-21 - Profile/action automation chuẩn

- Profile automation hiện hành: TikTok `0909128999` dùng `E:\shophuyvan-python-automation\profiles\browser\shophuyvan-runner-tiktok`; Shopee no-API `khogiadungcona` dùng `E:\shophuyvan-python-automation\profiles\browser\HuyVan_Bot_Data_khogiadungcona`.
- Các profile `HuyVan_Bot_Data_Shop1/Shop2/Shop3` chưa map shop thật, `automation_allowed=false`, không dùng runtime.
- Action map hiện hành: `pull_orders -> keodonmoi.py`, `refresh_status -> capnhattrangthai.py`, `sync_detail -> dongbochitiet.py`, `sync_finance -> capnhattaichinh.py`, `retry_label -> taitem.py`.
- Shop API không chạy Chrome/Seller Center fallback; source resolver giữ API-first cho `chihuy1984`, `chihuy2309`, `phambich2312`, `kinhdoanhonlinegiasoc@gmail.com`.
- Label Core: Shopee/Lazada API dùng Worker/Open Platform document route; Shopee no-API/TikTok queue `retry_label` local runner khi đủ điều kiện.

## Cập nhật 2026-05-21 - Final Core marketplace readback

- Order/Finance Core không còn cho TikTok dùng field riêng ngoài Core cho settlement pending. Sample `584123080227784403` dùng `estimated_income=67.755`, `actual_income=null`, `finance_source=tiktok_seller_center_finance_transaction`, `finance_confidence=estimated`.
- Tracking Core nhận timeline từ TikTok logistics drawer và Shopee Seller Center expanded DOM. OMS drawer phải đọc `tracking_events_json`/Tracking Core, không tự render timeline text rời.
- Customer/Contact Core chỉ lưu dữ liệu customer đã reveal thật; nếu Seller Center vẫn mask thì giữ trạng thái masked/permission-limited, không coi chuỗi có `*` là plaintext.
- Label Core sample TikTok `584123080227784403` đã `downloaded`, `label_download_mode=local_chrome_retry_label`, PDF server `labels/584123080227784403.pdf`.
- Shopee no-API finance sample `260520VPM23704` là fixture thực cho taxonomy: buyer paid `85.220` không được dùng làm doanh thu sản phẩm; voucher sàn `21.780` tách phần seller cofund `6.534`, actual settlement `70.030`.
- Lazada API finance khi chưa có settlement thật phải giữ lãi tạm tính; cost setting không được nâng thành `actual_income`.

## 2026-05-22 - OMS manual date scan Core map

- `retry_label` date scan: Order Core chọn đơn theo `created_at`, `updated_at`, `status_updated_at`, `last_synced_at`; Label Core và Tracking Core quyết định eligibility; live chỉ queue selected order ids.
- `sync_finance` date scan: Finance Core quyết định `missing`, `fallback_only`, `estimated_from_cost_setting`, `pending_settlement`, `pending_return_settlement`, `failed`, `cost_setting_fallback`, terminal finance stale; không bỏ terminal status khỏi queue.
- `refresh_tracking` date scan: Tracking Core quyết định `missing`, `stale`, `failed`, thiếu tracking cho đơn cần vận chuyển, tracking có thật nhưng events rỗng, last sync cũ hơn status update.
- TikTok Seller Center detail giữ `payment_method`, product breakdown, buyer shipping zero, SFR fee line và pending settlement trong Finance Core. Transaction pending không được phủ mất detail breakdown đã quét.
### Customer Core - Marketplace Contacts (2026-05-27)

- `marketplace_customer_contacts`: contact_key, platform, shop, customer/recipient name, buyer username/id, phone, address, payment method, last order, consent/contact/Facebook/Zalo readiness.
- `marketplace_customer_contact_orders`: dấu vết từng `source_order_id` đã nhập theo `contact_key`, dùng để rebuild append/merge contact mới mà không xóa dữ liệu cũ và không cộng trùng doanh thu/số đơn khi quét lặp.
- API đọc: `GET /api/customers/marketplace`, `GET /api/customers/marketplace/summary`.
- API ghi/rebuild: `POST /api/customers/marketplace/upsert`, `POST /api/customers/marketplace/rebuild`.
- Nguồn chính: Lazada Open Platform `/orders/get` address_shipping; TikTok local visible runner detail page sau khi operator profile đăng nhập.
- 2026-06-03 thêm nguồn Chat Core: Chat Worker nhận message khách từ Shopee/Lazada/TikTok/Zalo/Facebook, phát hiện SĐT/địa chỉ đã reveal thật, forward nội bộ sang Worker chính `POST /api/customers/marketplace/chat-ingest`, rồi Customer Core upsert vào `marketplace_customer_contacts`.
- Backfill tin cũ đi qua Chat Worker `POST /api/chat/customer-contacts/backfill`; UI `customer-database.html` chỉ đọc lại `GET /api/customers/marketplace*`, không parse hội thoại ở frontend.
- Contact đến từ chat mặc định `consent_status=unknown` và `contact_status=not_contacted`; dữ liệu masked/permission-limited không được coi là plaintext để remarketing.
- 2026-05-27 Chat Core send readback: outbound Shopee từ OMS/order context phải mang `order_id/order_sn` từ Core sang Chat Worker. Chat Worker lưu message `sending` trước, bridge gửi Shopee SellerChat với `content.order_sn`, rồi cập nhật `sent` chỉ khi sàn trả `platform_message_id`. Production sample `order-context-260527GANU1XNM` đã sent với `platform_message_id=2415648592711041393`.
