# Kế hoạch Shop / Order / Product Master Core

Ngày cập nhật: 2026-05-20

## Cập nhật kế hoạch Purchase/Warehouse Core giá vốn theo lô 2026-05-24

- Kho nhập hàng là kho chung, không tách theo shop. Product Core có thể có nhiều seller SKU/shop SKU cho cùng `internal_sku`, nhưng tồn kho và `current_cost` chỉ tính theo SKU kho.
- Thông số đóng kiện mặc định lưu một lần trong `product_logistics_profiles`; khi thêm/import lô mới, Core dùng profile mặc định cho field thiếu. Chỉ ghi đè profile khi người dùng chọn cập nhật mặc định mới.
- Luồng nhập hàng theo đợt: tạo `purchase_batches` trước, sau đó các dòng `purchase_batch_items`; từ đó sinh `inventory_cost_layers`, `sku_current_cost_read_model`, packing list, tờ khai và tổng hợp chi phí.
- Chỉnh sửa dữ liệu nhập sai không sửa âm thầm: `PATCH /api/purchase/batch-item-edit` bắt buộc lý do sửa, tạo `purchase_batch_revisions`, tính lại batch totals, cost layer và `current_cost`.
- Giá vốn không còn là số cố định theo SKU. Mỗi lần nhập hàng tạo một purchase/import batch riêng; batch cũ không bị ghi đè.
- Product Master/OMS/Promotion guard phải đọc `current_cost` từ `sku_current_cost_read_model`, source `warehouse_purchase_core`; không lấy `landed_cost_per_unit` của lô mới nhất làm giá vốn hiện tại nếu còn nhiều lô tồn.
- Công thức mặc định: `current_cost = sum(quantity_remaining * landed_cost_per_unit) / sum(quantity_remaining)`, method `weighted_average_remaining_stock`.
- Luồng nhập hàng chuẩn: Product Core SKU list -> import/manual preview -> confirm -> `purchase_batches` + `purchase_batch_items` -> `inventory_cost_layers` -> `sku_current_cost_read_model` -> UI/read-model.
- Ghi thật production đang chờ dữ liệu lô nhập an toàn; không dùng số giả để confirm vì sẽ làm lệch lãi OMS/Product Master.

## Cập nhật Final Core module sync 2026-05-21

- Order/OMS không dùng một cờ completeness chung để bỏ qua finance nữa. Read model phải giữ trạng thái riêng cho operation/detail/tracking/finance/label/chat và row finance health để terminal order hoặc cost-setting fallback vẫn queue `sync_finance` khi chưa có settlement hợp lệ.
- TikTok Finance transaction drawer là nguồn phí đã quét: source `tiktok_seller_center_finance_transaction`, settlement pending giữ estimate, không hiển thị lại badge `Khấu trừ cost setting` cho fee line đã parse từ TikTok.
- Lazada Chat từ OMS vẫn đi route Core `GET /api/core/orders/:orderId/chat-target`; nếu chưa resolve session IM thì trả reason rõ, không fail route và không gửi tin live.

## Cập nhật profile/action automation 2026-05-21

- Action center giữ tách chức năng: `pull_orders`, `refresh_status`, `sync_detail`, `sync_finance`, `retry_label`; runner Python route lần lượt vào `keodonmoi.py`, `capnhattrangthai.py`, `dongbochitiet.py`, `capnhattaichinh.py`, `taitem.py`.
- Profile map chung đã bổ sung `source`: API shop đọc API/Open Platform, no-API/TikTok mới dùng `local_browser`.
- Lazada profile manual đã tạo ở `E:\shophuyvan-python-automation\profiles\browser\HuyVan_Bot_Data_lazada_kinhdoanhonlinegiasoc`; Lazada production không dùng Chrome automation.
- `tiktok_don_hang.py` và `shopee_don_hang.py` còn giữ cho historical report/Excel; nút kéo nhanh/auto hằng ngày không gọi trực tiếp hai file này.

## Hotfix vận hành auto kéo đơn/trạng thái 2026-05-20

- Luồng tự động được chốt theo capability: shop API đi Worker Cron/API/Webhook; shop no-API đi Radar/local helper; TikTok nền không loop, manual one-shot vẫn chạy khi user bấm.
- API shop cố định: Shopee `chihuy1984`, `chihuy2309`, `phambich2312`; Lazada `kinhdoanhonlinegiasoc@gmail.com`. Các shop này không được Radar Chrome quét lại, kể cả khi người vận hành bật auto trong modal.
- No-API/local fallback: Shopee `khogiadungcona` dùng Radar theo `auto_order_enabled`, `auto_status_enabled`, interval và active window; TikTok `0909128999` hiển thị paused/reason hoặc one-shot-only để tránh loop nền.
- Modal `Tự động kéo đơn` phải chứng minh scheduler bằng `last_run/next_run/result/error`, không chỉ báo Radar process. Nếu chưa từng chạy thì hiện `Chưa từng chạy từ khi bật auto`; ngoài giờ hiện `Ngoài khung giờ chạy`.
- `Đánh thức ngay` không còn là ping health. Helper ghi wake request, Radar check scheduler ngay, trả `woke=true`, `scheduler_running`, `next_order_run_at`, `next_status_run_at`, `last_error`, `immediate_check_result`.
- Worker cron API giữ batch nhỏ, ghi diagnostic shop và không sync Payment live trong lượt auto order/status. Worker cron không tự queue Chrome fallback cho shop no-API; Radar/local scheduler mới là nơi đọc interval/active window cho `khogiadungcona` và TikTok one-shot.
- Lazada cron nền dùng batch nhỏ hơn, tắt trace sâu và suppress push live để tránh `Too many subrequests`; nếu vẫn lỗi thì UI phải hiện `last_api_sync_error`.

## Hotfix production OMS 2026-05-20

- Order read model là nguồn duy nhất cho trạng thái row OMS: tracking lấy từ `orders_v2` hoặc `order_tracking_core`, label pending có `next_retry_at`, và finance Lazada thiếu settlement confirmed phải hiện `Lãi tạm tính`/`Thiếu dữ liệu tài chính`.
- Lazada item image lấy từ Order/Item API trước, fallback Product Core qua `order_items.image_url`/`products.image_url`; khi thiếu ảnh thật, frontend chỉ dùng placeholder nhỏ để không làm row cao/trống lớn.
- Manual sync Seller Center chỉ dành cho `khogiadungcona`; API shops `chihuy1984`, `chihuy2309`, `phambich2312`, Lazada `kinhdoanhonlinegiasoc@gmail.com` phải skip rõ bằng API source routing.
- Panel vận hành không cho nhập shop tay. Dropdown shop đọc `/api/core/shops`, lọc theo Shopee/Lazada/TikTok và payload giữ `platform/shop_id/shop_key`.

## Cụm vận hành OMS Đồng bộ & tải lại 2026-05-20

- Scope chỉ thuộc Order/OMS vận hành, không làm lại Product Master, Finance rộng hoặc Chat. UI mới: nút `Đồng bộ & tải lại` trong OMS, module `apps/fe/js/modules/oms-resync-panel.js`.
- Tải lại tem lỗi chạy theo thứ tự vận hành: `Kiểm tra trước` gọi dry-run `POST /api/label/retry-failed`; `Chạy tải lại` mới gọi thật. Batch chọn `10/20/50`, nhưng route vẫn tự requeue khi vượt budget subrequest và ghi `pending_retry/lazada_batch_requeued`.
- Đồng bộ lại đơn TikTok/Shopee no-API chạy theo thứ tự: chọn ngày/shop/sàn/scope -> dry-run `POST /api/orders/manual-sync/backfill` -> nếu có job mới gọi local helper `/report-run` one-shot. Không có ngày hoặc mã đơn thì route trả `date_range_required`.
- TikTok không resume loop: UI chỉ gửi `allow_run=true` khi user bấm chạy thật; local report worker chạy `watch=false` và tự pause sau batch bằng `one_shot_batch_completed`. Tab runner `Kiểm resume` dùng `allow_run=false` để không bật chạy thật.
- Shop API không được Seller Center fallback. Nếu chọn `chihuy1984`, `chihuy2309`, `phambich2312` hoặc `kinhdoanhonlinegiasoc@gmail.com` cho Shopee manual-sync, route trả `skipped=1`, `eligible=0`, `queued=0`, message dùng Open Platform API.
- Các nút/route này không gọi create fulfillment, ship, arrange, confirm, cancel, RTS, gửi tin live hoặc sync Payment live. Seller Center parser chỉ đọc status/tracking/items/payment nếu trang có, rồi ghi Warehouse/Core.
- Sau status/detail sync nếu đơn đã đủ điều kiện label, flow chuẩn queue/tải lại bằng label route; tem lỗi về `pending_retry/error` để lọc lại trong tab `Tải lại tem lỗi`.

## Hotfix OMS source/label API 2026-05-20

- Tạo ranh giới quyết định nguồn tại `order-data-source-resolver.js`. Mọi route detail/label/read model phải gọi resolver trước khi ghi `status_source`, queue Seller Center, hoặc hiển thị nguồn trên OMS.
- Shop có API (`chihuy1984`, `chihuy2309`, `phambich2312`, `kinhdoanhonlinegiasoc@gmail.com`) đi API trước; `khogiadungcona` mới đi Seller Center fallback; TikTok `0909128999` là manual/local helper. Không tự chuyển API shop sang Seller Center vì một endpoint chưa implement.
- Shopee Open Platform docs xác nhận tải tem cần flow nhiều bước: lấy tham số chứng từ nếu cần, gọi `create_shipping_document`, poll `get_shipping_document_result` tới `READY`, rồi `download_shipping_document`. Đây là tạo chứng từ in/waybill, không phải `ship/arrange/confirm/cancel`.
- Guard bắt buộc: `allowDocumentGenerate=true` chỉ ở `POST /api/label/:orderId/refresh` cho Shopee API; `allowFulfillmentAction=false` luôn. Status sync, Seller Center detail và Python helper không được gọi document-generation hoặc fulfillment endpoint.
- Lazada PrintAWB/package document phải chạy theo batch nhỏ có budget subrequest. `POST /api/label/backfill-eligible` mặc định `limit=8`, tối đa `20`, `max_subrequests_per_run=32`; vượt budget thì requeue bằng `pending_retry/lazada_batch_requeued`.
- OMS chỉ hiện lỗi ngắn trên dòng đơn và giữ raw technical trong tooltip/diagnostic. Source của `chihuy2309` phải là `API`; `seller_center_detail_url_not_found` chỉ được hiện cho no-API/manual.

## Cleanup khóa vận hành status/detail/label 2026-05-20

- Lượt cleanup không thêm tính năng mới và không đổi schema Warehouse. Phạm vi chỉ cắt legacy route/helper/caller và làm rõ diagnostic vận hành.
- Đã xóa helper frontend Shopee không còn caller vốn tự dựng URL Seller Center từ `id/order_sn`. Rule hiện hành: chỉ dùng `seller_center_detail_id/url` đã verify hoặc Seller Center search.
- Legacy label route `/api/labels/refresh/*` giữ wrapper 410 để caller cũ fail rõ. Frontend chỉ gọi `/api/label/:orderId/refresh` hoặc `/api/label/backfill-eligible`.
- Shopee API label dùng flow chứng từ in chính thức có guard `allowDocumentGenerate=true` và `allowFulfillmentAction=false`; không có `allowCreate` cũ. Local helper Shopee legacy bị khóa create/ship/prepare/confirm; `refresh_label` và `print_label` legacy bị từ chối bằng `legacy_*_disabled`.
- OMS/Admin diagnostic đã rõ hơn: status sync, Seller Center detail parser, label runner, `manual_required`, lỗi gần nhất và `next_retry_at` đều hiện từ Core/read model.
- Guard test mới `test-legacy-flow-locks` được đưa vào `npm test` để chặn khôi phục route/caller/endpoint legacy.

## Cập nhật kế hoạch realtime status, Seller Center detail và auto label 2026-05-19

- Mục tiêu hiện hành: shop có API tự polling/check status bằng API chính thức; shop không API/manual tự cập nhật bằng Seller Center/local helper fallback; trạng thái đổi phải ghi Order Warehouse/Core rồi mới hiện ra OMS/Dashboard/Export/Chat.
- Entry points đã chốt: cron `scheduled()`, hook sau `importOrdersV2()` và route `POST /api/orders/status/sync`. Backfill cũ chỉ chạy theo eligibility, shop/date/order/status filter và batch nhỏ; không quét toàn bộ mỗi cron.
- Shopee API shops `chihuy1984`, `chihuy2309`, `phambich2312` dùng Shopee Open Platform; Lazada `kinhdoanhonlinegiasoc@gmail.com` dùng Lazada API. TikTok `0909128999` chưa có API order/token thì dùng Seller Center/local helper, không gọi API giả.
- Shopee no-API `khogiadungcona` dùng Seller Center detail fallback: route `/api/orders/shopee-seller-detail/eligible|queue|backfill|diagnostic`, local helper `E:\shophuyvan-python-automation\oms_python\platforms\shopee\orders\dongbochitiet.py` và `capnhattaichinh.py`. Parser chỉ đọc DOM/text và chỉ bấm các nút mở rộng nội dung read-only.
- Không được tự dựng Seller Center URL từ mã đơn. Nếu chỉ có `order_sn`, resolve theo Warehouse field `seller_center_detail_id/url` trước, sau đó search order list bằng Chrome profile thật, click đúng dòng, lấy `/portal/sale/order/<seller_center_internal_id>`, xác nhận mã đơn trên trang khớp rồi mới ghi `seller_center_detail_id`, `seller_center_detail_url`, `detail_url_source`, `detail_url_verified_at`.
- Finance từ Seller Center detail là nguồn `shopee_seller_center_detail`; ghi `order_fee_details.raw_data.shopee_seller_center_detail` khi có phần thanh toán. Nếu parser chưa thấy payment section thì ghi thiếu dữ liệu rõ ràng, không fake `actual_income` và không hạ confirmed settlement cũ.
- Auto label đã chuyển từ nút tay sang runner: `backfillEligibleLabels()` và `POST /api/label/backfill-eligible`/`retry-failed`. Shopee API dùng document flow guard; Lazada tải AWB/document read-only; Shopee no-API/TikTok queue `retry_label` vào `taitem.py` bằng profile map chuẩn.
- Route chuẩn giữ nguyên `POST /api/label/:orderId/refresh`; legacy `/api/labels/refresh/*` là `410`. Python/helper không gọi `create_shipping_document`; mọi luồng không gọi `ship_order`, `arrange`, `confirm`, `cancel`, không gửi tin live và không sync Payment live.

## Cập nhật kế hoạch Order Status Core và label eligibility 2026-05-19

- Phase 2 giữ Core hiện có và làm gọn thay vì tạo file Core mới: `core/orders/status-core.js` là nơi duy nhất map status Shopee/TikTok/Lazada/manual; `core/orders/read-core.js` là nơi duy nhất dựng read model status/label cho UI/API.
- Các field phase 2 đã có trên read model: `raw_platform_status`, `order_status_core`, `fulfillment_status_core`, `display_status_vi`, `order_type`, `terminal_status`, `label_eligible`, `label_status`, `label_reason`, `shipping_label_url`, `label_file_path`, `last_label_download_at`, `last_label_error`, `label_download_mode`, `label_download_supported`, `label_download_source`, `label_download_reason`, `label_download_read_only`, `label_download_requires_manual`.
- Caller đã chuyển: `/api/orders`, `/api/orders/changes`, `/api/core/orders/*`, Dashboard summary, Order Analytics, Export, OMS render/logistics watch và Chat order-link. Mapper raw ở frontend được cắt, chỉ còn format màu/icon theo Core.
- Code cũ đã cắt/thay: `mapShopeeStatus()` và `mapPlatformStatus()` là wrapper về `mapMarketplaceOrderStatus()`; legacy `POST /api/labels/refresh/*` trả 410; auto refresh label khi đổi trạng thái đóng gói/webhook/Kho tem in bị hạ xuống summary read-only, không tải tem thật và không tạo job `refresh_label`.
- 45 đơn `order_type=return + COMPLETED` không cần backfill ngay vì read model đã hiển thị đúng `Hoàn / trả`; phase này không mutate dữ liệu thật, touched `0`. Nếu sau này vẫn cần backfill thì bắt buộc chạy `dry_run`, `limit`, shop/platform/date/status filter trước.
- Label rule phase 2: `downloaded`, `eligible`, `not_ready`, `not_supported`, `manual_required`, `error`. OMS hiển thị thêm capability: `Có thể tải tem`, `Đã tải tem`, `Chưa đủ điều kiện`, `Cần làm thủ công`, `Chưa hỗ trợ sàn/shop này`, `Lỗi tải tem`.
- Capability tải tem theo shop/platform: Shopee API dùng `api_document_generation_then_download`; Shopee no-API `khogiadungcona` và TikTok `0909128999` dùng `local_chrome_retry_label`; Lazada API dùng PrintAWB/package document read-only; profile chưa map là `manual_required`; không gọi API giả.
- Route label chuẩn: đọc `GET /api/labels/status`, tải/dry-run một đơn bằng `POST /api/label/:orderId/refresh`, batch eligible bằng `POST /api/label/backfill-eligible`/`retry-failed`. Route chuẩn chặn đơn không `label_status=eligible` hoặc capability không read-only; auto/bulk chỉ chạy qua eligibility batch nhỏ.

## Cập nhật kế hoạch TikTok Seller Center detail finance 2026-05-19

- Phạm vi chỉ là dữ liệu doanh thu/lãi tạm tính TikTok vào Order/Finance Core; không làm lại Shop/Product/Order rộng, không sync Payment live và không gọi action ghi sàn.
- TikTok chưa có API order/token chính thức trong hệ thống nên dùng Seller Center detail read-only/import/manual. Parser bắt buộc kiểm `order_no` URL và mã đơn trên trang khớp nhau.
- Mapping nghiệp vụ: `Tổng cộng` -> Tổng doanh thu báo cáo / Người mua thanh toán; `Tổng các mặt hàng sau khi giảm giá` hoặc `Tổng (các) mặt hàng sau khi giảm giá` -> Tiền sản phẩm sau KM shop và là basis lãi tạm tính; `Phí vận chuyển sau khi giảm giá` -> phí vận chuyển người mua trả, chỉ đối soát doanh thu; `Số tiền bạn kiếm được` -> Thực nhận ví nếu có.
- Runner/parser phải mở `Hiển thị chi tiết` trong khối thanh toán nếu Seller Center đang thu gọn, rồi mới parse/upsert; không dùng DOM thu gọn để kết luận thiếu `product_revenue_after_shop_discount`.
- Nếu chưa có Thực nhận ví, Core phải ghi `Lãi tạm tính`, `actual_income=NULL`, `estimated_income` là số tạm tính trước vốn/ADS/PiShip, `profit_basis=Tiền sản phẩm sau KM shop`, `settlement_status=pending_settlement`, không dùng `Tổng cộng` và không cộng phí vận chuyển người mua trả vào lãi.
- Runner mới: Worker route `/api/orders/tiktok-seller-detail/*` quản eligibility/queue/backfill/diagnostic; local helper `parser_chitiet.py`, `dongbochitiet.py` và `capnhattaichinh.py` mở Seller Center bằng Chrome profile automation map, chỉ đọc trang detail.
- Runner được queue sau kéo/import đơn mới qua `importOrdersV2()` và sau luồng kiểm trạng thái `status_only` cho đơn pending settlement/chưa có actual income; batch nhỏ tối đa 20, không quét toàn bộ TikTok mỗi cron.
- Export/OMS/Profit/Dashboard phải đọc lại `order_analytics` và taxonomy; không tự dựng công thức TikTok riêng ở UI.
- Guard mới 2026-05-19: số estimate cũ không được ghi thành `actual_income`; `actual_income` confirmed chỉ chuyển từ pending khi parser thấy `Số tiền bạn kiếm được`, và không bị runner sau ghi `NULL` ngược lại.

## Cập nhật Finance taxonomy cho Order/OMS 2026-05-19

- Không làm lại Shop/Product/Order rộng. Scope chỉ khóa taxonomy phí/doanh thu/lãi cho OMS/Profit/Dashboard/Export.
- Order/Finance Core phân tách `shop_discount` khỏi `marketplace_fee_total`; voucher shop không còn nằm trong `Phí sàn`.
- Profit theo `buyer_paid` dùng `buyer_paid - cost - marketplace_fees - taxes - ops_ads_fees_not_in_settlement`, nên không trừ voucher shop lần hai.
- Profit theo settlement dùng `actual_income - cost - ops_ads_fees_not_in_settlement`, nên không trừ lại khoản đã nằm trong ví/settlement.
- OMS popup phí chuyển từ hover-only sang click-to-open/pinned; state theo `order_id` và được đồng bộ sau mỗi lần list re-render.
- Export finance thêm cột taxonomy để downstream đọc đúng `Phí sàn`, `Thuế / Khấu trừ`, `Phí ngoài sàn / Ads`, `Tổng khấu trừ`, không phải suy từ cột `fee` legacy.
- Lượt này không gửi tin live, không gọi marketplace action nguy hiểm và không sync Payment live.
- Production deploy: Worker chính `cc96348c-ebcb-441a-852e-03be377435eb`, static UI `1e47c9f4-14ab-48bc-9c16-406d42296b02`.

## Cập nhật hotfix OMS -> Chat mới 2026-05-19

- Mục tiêu hotfix: khôi phục `Nhắn khách` trong OMS bằng Chat mới, không hồi sinh Chat legacy.
- Route Core mới: `GET /api/core/orders/:orderId/chat-target` trả `chat_target` từ Order Core và Shop Core để OMS biết có thể mở Chat mới hay cần hiện reason.
- Frontend OMS dùng `apps/fe/js/modules/oms-chat-actions.js` và `data-open-customer-chat`; không dùng `openOrderChatResolver`, `data-chat-order-open`, hoặc `/api/chat/resolve-order-conversation`.
- Chat mới nhận `order_id/shop_id/customer_id` qua URL, tìm conversation trong Chat Worker mới nếu có; nếu không có conversation thì vẫn render tab `Đơn` và `Sản phẩm` từ Core theo mã đơn.
- Shopee API/bridge là nền tảng mở Chat mới; Shopee chưa bật Chat API, Lazada, TikTok và manual/import phải trả reason rõ, không ẩn nút và không gửi tin live.

## Cập nhật hotfix Product tab Chat mới 2026-05-19

Lượt này khôi phục thao tác sản phẩm trong Chat/CSKH mới bằng Product Master/Core, không khôi phục Chat legacy.

- UI `chat-cskh.html` có lại tab `Sản phẩm` cạnh `Khách`, `Đơn`, `Trạng thái`; file xử lý chính là `apps/fe/js/dashboard/chat/products.js`.
- Khi hội thoại đã có order context, tab ưu tiên `Sản phẩm liên quan` từ `/api/core/orders/by-conversation/:conversationId`. Nếu chưa có context, nhân viên tìm bằng tên/SKU qua `/api/core/products/search`.
- Product Master/Core là nguồn đọc bắt buộc: `products`, `product_variations`, `marketplace_product_knowledge` chỉ đi qua `searchCoreProducts()` và `/api/core/products/by-sku/:sku`; không tạo product store riêng cho Chat.
- Dòng sản phẩm hiển thị ảnh, tên, SKU, item id sàn, giá, tồn, badge nguồn và trạng thái capability gửi card.
- `Gửi thẻ sản phẩm` không gọi route cũ. Flow đúng: UI -> Chat Worker `POST /api/chat/product-cards/send` -> Product Core verify -> Shopee adapter -> Worker chính Shopee bridge `/api/internal/chat-bridge/shopee/messages/product-card`.
- Shopee chỉ enable khi shop có `send_capability=official_api|bridge`, adapter/bridge cấu hình đủ và sản phẩm có item id Shopee. Route hỗ trợ dry-run để test capability không gửi live.
- Lazada/TikTok/manual/import disable action và hiện reason rõ; không fake success, không tự gửi text thay product card.
- Legacy product catalog/advisory files đã xóa và không restore: `fe-chat-product-catalog-modal.js`, `fe-chat-product-advisory-editor.js`, `fe-chat-order-product-context-panels.js`, `fe-chat-context-tab-product-advisory-status.js`, `fe-chat-order-product-actions.js`.
- Deploy/verify hotfix: Worker chính `3a8ad03b-a557-4d0c-a149-d60445665e2f`, Chat Worker `76fc53b2-e0df-4c8d-9f2b-d1e974a8c42b`, static UI `54d8476a-bf9e-4a45-8a6e-49520110f49e`.
- Production UI pass bằng Chrome profile `E:\codex-chrome-profiles\shophuyvan-test`: `1366x900`, `820x1180`, `390x844` đều có tab `Sản phẩm`, search Product Core pass, không tràn ngang, không gửi tin live.
- Production API pass: Product Core `by-sku/search` `200`, Chat Worker health `200`, product-card route dry-run pass, Worker chính `/api/chat/*` legacy vẫn `410`.

## Cập nhật xóa/cắt Chat legacy 2026-05-19

Mục tiêu duy nhất của lượt này là cắt Chat cũ khỏi frontend/backend mà không làm lại Shop/Product/Order/Finance.

- `apps/fe/pages/chat-marketplace.html`, `apps/fe/js/dashboard/chat-marketplace-page.js`, `apps/fe/js/dashboard/fe-chat-marketplace-loader.js` và toàn bộ `apps/fe/js/dashboard/fe-chat-marketplace/*` đã xóa.
- Các caller frontend còn sống được xử lý: link điều hướng chuyển sang `chat-cskh.html`, service worker mở Chat mới, OMS bỏ caller `openOrderChatResolver()`/`data-chat-order-open` và không gọi `/api/chat/resolve-order-conversation` nữa.
- `apps/worker-api/src/routes/worker-chat-marketplace/*` và `apps/worker-api/src/core/chat/*` đã xóa. API sync Product dùng `core/products/product-knowledge-core.js` thay vì helper Chat legacy.
- Worker chính không còn phục vụ runtime `/api/chat/*` legacy; mọi `/api/chat/*` trên Worker chính trả `410 legacy_chat_route_disabled`.
- Các route public cũ cần chặn an toàn: `/api/auth/lazada/chat/url`, `/channels/lazada/chat/callback`, `/api/shops/disconnect-chat-api` trả 410 rõ ràng, không ghi token/trạng thái và không fallback legacy.
- Chat mới đọc đơn/sản phẩm/shop/finance qua Core: `/api/core/orders/by-conversation/*`, `/api/core/products/by-sku/*`, `/api/core/shops` và Finance Core/`order_analytics` khi cần số tiền.
- Bridge giữ lại là bridge Chat mới: `apps/worker-api/src/routes/marketplace-chat/shopee-bridge.js` cho `/api/internal/chat-bridge/shopee/sync` và `/messages/send`; route GET bridge read cũ trả 410.

Các phần lịch sử bên dưới có thể nhắc trạng thái "chưa xóa" trước 2026-05-19; trạng thái hiện hành là legacy đã bị xóa hoặc 410 như trên.

Verify production sau cleanup:

- Worker chính deploy `04e42159-a24d-49e9-9e6e-eaea13b7c59b`; static UI deploy `8c3807de-197a-4daa-81e1-3eb1ac697990`.
- `chat-cskh.html` mở thật bằng profile `E:\codex-chrome-profiles\shophuyvan-test`, click hội thoại và tab `Đơn` ở `1366x900`, `820x1180`, `390x844`; không tràn ngang, không có link/tab/script Chat legacy.
- Network production không có request tới `fe-chat-marketplace` hoặc Worker chính `/api/chat/*`; Chat Worker mới và Core API vẫn chạy.
- Finance Core ngày `2026-05-18` còn `status=ok`; exact duplicate `order_items=0`.

## Cập nhật tổng vệ sinh runtime đọc dữ liệu 2026-05-19

Không làm lại Shop/Product/Order/Finance. Kết quả cleanup runtime:

- Deploy Worker chính `5758ca3f-b27d-4c73-bfc1-bbd1885e21f0`, static UI `697c6142-e9c4-465f-8beb-12b5923616d9`.
- Finance Core ngày `2026-05-18` rebuild `sync_payment=false`: `orders=68`, `saved=68`, `status=ok`, `gross_revenue=7.624.224đ`.
- Production D1 guard: duplicate exact `order_items=0`, duplicate `orders_v2=0`, missing/orphan `order_analytics=0`.
- Browser profile ShopHuyVan pass `1366x900`, `820x1180`, `390x844`; Profit Dashboard không còn loader Chat legacy.

- Chat mới giữ hướng chuẩn: Chat Worker chỉ quản conversation/message; Shop/Product/Order/Finance đọc Worker chính qua Core API. Không gửi tin live trong lượt này.
- Chat legacy không còn giữ cho OMS `Nhắn khách`; caller này đã xóa. Bridge/readback mới đi qua `marketplace-chat/shopee-bridge.js`, không dùng router legacy.
- OMS giữ `/api/orders` để không phá contract vận hành, nhưng endpoint này là wrapper đọc Warehouse/Core tables và status/fee core, không tạo source order riêng.
- Dashboard/Profit đọc Finance Core/`order_analytics`; rule mới là KPI tổng và breakdown phải cùng source, không dùng fallback bẩn khi snapshot guard báo stale.
- Export đọc item từ `order_items` đã có duplicate exact guard; finance từ `order_analytics` và luôn xuất marker nguồn. Không merge same-SKU khác biến thể/tên/tiền/số lượng.
- Product page tiếp tục đọc Product Master route; legacy Chat item enrich fallback sang `products` khi `order_items` thiếu tên/ảnh.
- Auto scan diagnostic đọc capability thật: Shopee/Lazada API khi có token, Shopee non-API manual/import/browser, TikTok `0909128999` manual/reference nếu chưa có API order.

Việc đã cắt:

- `profit-dashboard.html` bỏ loader `fe-chat-marketplace-loader.js`.
- `display-core.js` chặn raw Shopee/Lazada shop id khỏi public shop display.

Việc chưa xóa:

- Không còn giữ `chat-marketplace.html` hoặc `/api/chat/*` legacy. Worker chính trả 410 cho `/api/chat/*`; Chat Worker riêng vẫn phục vụ `/api/chat/*` của hệ mới.
- Income/readback và `recalcCost()` vì còn là đường lấy nguồn hoặc bảo trì write-path.
- Route 410 giữ để caller cũ không mutate dữ liệu.

## Cập nhật bước Shop Core tên shop Shopee 2026-05-18

- Bổ sung Shop Profile Sync chính thức cho Shopee: `Shopee Shop API -> normalizeShopProfile() -> shop_core_profiles -> /api/core/shops -> Chat conversation enrich`.
- Endpoint chính thức dùng để lấy tên shop: `GET /api/v2/shop/get_shop_info`; field tên là `shop_name`. Endpoint bổ sung: `GET /api/v2/shop/get_profile`; field tên là `response.shop_name`, logo là `response.shop_logo`.
- Fallback hiển thị: API profile đã sync -> snapshot `shop_core_profiles` -> alias nội bộ/manual -> `Shop chưa đồng bộ tên`. Raw numeric `shop_id` chỉ dùng trong chi tiết kỹ thuật, không làm display name chính.
- Runtime guard ở Worker chính, Chat Worker và UI mới đều chặn tên dạng raw numeric hoặc `Shopee <id>`; nếu Core chưa có tên hợp lệ thì UI phải hiện `Shop chưa đồng bộ tên` kèm badge `Thiếu tên shop`.
- Chat Worker không giữ bảng tên shop riêng; endpoint conversation enrich từ `/api/core/shops` và trả `shop_display_name`, `shop_name_source`, `shop_name_missing`.
- Product/Order/Finance chỉ audit/map trong lượt này, chưa refactor runtime ngoài Shop Warehouse.
- Scope vẫn chỉ Shopee Shop Core. Không đổi order/product/finance sync và không đụng Lazada/TikTok/Facebook/Zalo/AI.
- Production verify: `GET /api/shops/shopee-profile-sync?shop_id=170044686` trả `GIA DỤNG HUY VÂN`; `?shop_id=166563639` trả `shophuyvan.vn`. `/api/core/shops` và summary tương ứng trả `shop_name_missing=false`.
- Chat conversation API đã enrich các conversation Shopee bằng `shop_display_name`; kiểm thread `177616` và `175956` không có duplicate `platform_message_id` trong 200 message gần nhất.
- Deploy Shop Warehouse guard mới: Worker chính `d8e7ae88-a31e-4e2c-8b71-3a95bb4872b3`, Chat Worker `ff2d5b00-9bdb-4f6e-be0f-9825a95875af`, static UI `06d47676-37f9-4a24-a704-646f67e683ae`.

## Cập nhật Finance Warehouse/Core 2026-05-18

- Không làm lại Shop/Product. Shop đã pass Warehouse, Product Master vẫn là nguồn chuẩn `products/product_variations`.
- Không refactor Order runtime ngoài phần Finance cần đọc `orders_v2/order_items/order_fee_details`.
- Finance nguồn chuẩn: `order_analytics` cho số theo đơn, `order_fee_details` cho phí/settlement raw, `marketplace_order_finance_daily_snapshots` cho snapshot ngày/tháng.
- Profit trước sửa: `/api/profit-by-day` tự tính từ `orders_v2.profit_real`, fee và return ledger; sau sửa: wrapper đọc `loadOrderFinanceCore().by_day`.
- Income trước/sau: `/api/income/*` giữ vai trò lấy nguồn Shopee Payment/Lazada Finance/payout/report, không dùng làm báo cáo lịch sử nếu `order_finance_core` đã có.
- Export trước sửa: `/api/export-orders` tự phân bổ các cột phí legacy từ `orders_v2`; sau sửa: phân bổ số đã chuẩn hóa từ `order_analytics`, trả nguồn/confidence.
- Dashboard trước sửa: daily/top chart và tổng doanh thu/lãi còn đọc `orders_v2`; sau sửa: revenue/profit/top chart đọc `order_analytics`, `/api/dashboard` trả metadata và summary từ `order_finance_core`.
- Legacy chưa xoá: `calcProfit()` tên legacy nhưng đã gọi `fee-phase1-core`, `recalcCost()` write-path bảo trì, `priceCalc()` mô phỏng giá bán, và `/api/income/*` source-acquisition.
- Deploy/verify: Worker chính `3605a561-cb25-41eb-be05-25234e1a961b`, static UI `c5da67a2-c3f4-4e9b-8fed-93515743d3a0`; Chrome profile `E:\codex-chrome-profiles\shophuyvan-test` pass desktop/tablet/mobile cho Profit Dashboard và export CSV.

## Cập nhật Order Warehouse/Core 2026-05-19

- Không làm lại Shop/Product/Finance. Shop đã pass Warehouse, Product Master giữ nguồn chuẩn `products/product_variations`, Finance Core giữ `order_analytics` và snapshot guard `calc_version`.
- Order Core nguồn chuẩn vẫn là `orders_v2`, `order_items`, `order_fee_details`; không tạo schema mới vì các field cần cho cleanup đã có.
- Thêm `apps/worker-api/src/core/orders/read-core.js` để gom status/source/display id cho Order Core và OMS wrapper. Helper này dùng `order_status_core`, không để UI tự suy luận `order_type` từ raw text.
- `/api/core/orders/:orderId` và `/api/core/orders/by-conversation/:conversationId` tiếp tục là API đọc chuẩn cho Chat mới.
- OMS trước sửa: `/api/orders` đọc `orders_v2/order_items/order_fee_details` và trả row tự map trong route. OMS sau sửa: vẫn giữ endpoint để không phá runtime, nhưng row được normalize qua `normalizeOrderListRowForCore()` rồi mới trả ra UI.
- Dashboard order/status tiếp tục đọc `orders_v2` + `order_status_core`; doanh thu/lãi vẫn qua Finance Core, không phá snapshot guard.
- Export order giữ `orders_v2/order_items` cho metadata và `order_analytics` cho số Finance; không quay lại helper fee/profit legacy.
- Chat dùng hướng mới theo xác nhận vận hành: UI mới `apps/fe/js/dashboard/chat/order-link.js` đọc `/api/core/orders/by-conversation/*`; legacy Chat marketplace không refactor trong lượt này.
- Đã cắt runtime hai route legacy: `POST /api/orders/archive-old` và `GET /api/fix-shop-names` trả `410`, không còn ghi thẳng dữ liệu cũ vào `orders_v2`.
- Chưa xoá `bulk-delete`, `debug-status`, `recalcCost()` vì lần lượt là tool bảo trì có chủ đích, audit read-only, và write-path cost/profit cũ chưa có replacement đầy đủ.

## Cập nhật duplicate order_items legacy 2026-05-19

- Mục tiêu lượt này chỉ là khóa và dọn duplicate `order_items` legacy; không làm lại Shop/Product/Finance/Auto Scan và không sửa UI.
- `order_items` canonical key khi chống duplicate: `platform` + `order_id` + `sku` + `variation_name` + `product_name` + `image_url` + `qty` + `revenue_line` + `cost_real` + `cost_invoice` + `original_price` + `sale_price` + `current_price` + `price_source` + `reservation_id`.
- Đã thêm guard `apps/worker-api/src/routes/orders/order-items-dedupe.js` vào `importOrdersV2()`. Guard chỉ xử lý duplicate exact sau insert, không gom các dòng cùng SKU nếu khác biến thể/tên/tiền/số lượng.
- Cleanup production đã backup rồi xóa `18` dòng duplicate exact trong `14` nhóm Shopee, range `2026-05-02..2026-05-13`. Dòng canonical giữ theo `id` mới nhất.
- Không xóa nhóm cùng SKU hợp lệ hoặc chưa chắc: ví dụ `2605102FQYD1TW` có hai dòng SKU `DAYVOISENTOTK231` khác biến thể, tên hàng, số lượng và doanh thu dòng.
- Do duplicate đã ảnh hưởng Top SKU/Product/Export/Profit theo sản phẩm, đã rebuild `order_analytics` cho range liên quan với `sync_payment=false`; Finance snapshot guard vẫn bật và Finance Core trả `status=ok`.

## Cập nhật Order auto scan / Finance reconcile 2026-05-19

- Không thêm feature mới; chỉ khóa lại đường tự động quét đơn theo capability và không làm lại Shop/Product/Finance.
- Shop có API order hiện tại: Lazada `kinhdoanhonlinegiasoc@gmail.com`, Shopee `chihuy1984`, `chihuy2309`, `phambich2312`. Cron nền kéo đơn bằng API chính thức rồi upsert Order Warehouse.
- Shop Shopee không API: `khogiadungcona`; không polling API giả, chỉ dùng browser/import/manual có log vào `orders_v2/order_items`.
- TikTok `0909128999`: chưa có API order chính thức/token hợp lệ trong hệ thống; hiện dùng fallback local helper/import/manual, source `manual_reference`.
- `importOrdersV2()` ghi diagnostic quét đơn cho cả fallback để admin thấy `last_order_sync_at/status/error`, không chỉ shop API.
- Shop capability API trả `order_sync_mode` từ Order Warehouse (`API`, `Browser`, `Import`, `Manual`); UI admin chỉ render field này, không tự gắn nhãn API cho TikTok hoặc shop chưa API.
- Shop capability API trả thêm runner diagnostic để người vận hành biết runner nào đang chịu trách nhiệm: Worker cron API cho Shopee/Lazada, local `report_worker` cho TikTok/import/manual, local Radar cho browser helper. Nếu health local không thấy process thì UI phải ghi `Chưa có runner tự động`.
- `report_worker` hiện là `E:\shophuyvan-python-automation\oms_python\features\reports\run_report_jobs.py`; chỉ canh job report đọc/import, không gửi tin, không sync Payment và không gọi action ghi sàn.
- Cron status Shopee giảm batch và không gọi escrow/payment khi chạy nền; Finance Core stale guard vẫn phát hiện thiếu `order_analytics` so với `orders_v2` normal.
- Mismatch ngày `2026-05-18`: thiếu analytics cho đơn TikTok `584090485281163170`; rebuild Finance ngày này phải chạy `sync_payment=false`.

## Mục tiêu

Đưa Chat/CSKH, OMS, Dashboard, Product Master và Profit về cùng nguồn đọc tối thiểu cho Shopee trước. Bước đầu không đổi UI lớn, không đổi route sync hiện có và không fake API data.

## Audit Warehouse lượt này

- Shop Core: đã pass, nguồn hiển thị shop là `shop_core_profiles` qua `/api/core/shops`; raw `shop_id/api_shop_id` chỉ là technical id.
- Product Master Core: đã có nguồn chuẩn `products` và `product_variations`; Product page đọc `/api/products` là route Product Master, không tạo Product riêng cho Chat.
- Order Core: đã có endpoint đọc `/api/core/orders/:orderId` và `/api/core/orders/by-conversation/:conversationId`; Chat UI mới đọc Order Core, OMS runtime `/api/orders` vẫn đọc `orders_v2/order_items/order_fee_details` nhưng row trả ra đã qua `read-core` + `status-workflow` + `fee-phase1-core`.
- Finance/Fee Core: đã có `fee-phase1-core`, `dashboard_finance_fee_core`, `order_finance_core`, `order_analytics`, `marketplace_order_finance_daily_snapshots`; Profit/Dashboard/Export read-path đã chuyển thành wrapper đọc Core, Income giữ lại cho source-acquisition/readback.
- Phần chọn làm trong lượt Finance: không làm lại Product/Order, chỉ cắt đường read-path tính tài chính đi vòng Core.

## Thiết kế tối thiểu đã triển khai

### Shop Core

Nguồn chính: `shops` qua `marketplace/shop-capability-core.js`.

Field chuẩn trả về:

- `shop_id`
- `platform`
- `shop_name`
- `api_status`
- `api_capability`
- `shop_chat_mode`
- `send_capability`
- `sync_capability`
- `product_sync_capability`
- `order_sync_capability`
- `finance_sync_capability`
- `last_sync_at`
- `last_error_code`
- `last_error_message`

Shop API Shopee trả `badge=API`. Shop chưa API trả `badge=Fallback` và capability manual/import/cost setting.

### Order Core

Nguồn chính: `orders_v2`, `order_items`, `order_fee_details`.

Field chuẩn trả về:

- `platform_order_id`
- `shop_id`
- `platform`
- `buyer_name`
- `buyer_user_id`
- `status_raw`
- `status_label_vi`
- `payment_status`
- `shipping_status`
- `tracking_number`
- `items`
- `amounts`
- `source`
- `confidence`
- `updated_at`

Status tiếng Việt dùng `order_status_core`, không map lại trong Chat UI.

### Product Master Core

Nguồn chính: `products`, enrich bằng `product_variations`.

Field chuẩn trả về:

- `platform_product_id`
- `platform_variation_id`
- `sku`
- `name`
- `variation_name`
- `image_url`
- `price`
- `stock`
- `cost`
- `source`
- `confidence`
- `updated_at`

Không tạo bảng sản phẩm riêng cho Chat. Nếu SKU chỉ có snapshot sàn thì badge là `Snapshot`; nếu có Product Master thì ưu tiên `Product Master`.

### Finance/Fee Core

Nguồn bước đầu: `order_fee_details` + các field đã chuẩn hóa trên `orders_v2`.

Các field trả theo format `{ value, source, confidence, updated_at, badge }`:

- `product_original_amount`
- `product_selling_amount`
- `shop_discount_amount`
- `platform_voucher_amount`
- `shop_voucher_amount`
- `shipping_fee_buyer_paid`
- `shipping_fee_actual`
- `platform_shipping_subsidy`
- `commission_fee`
- `service_fee`
- `transaction_fee`
- `affiliate_fee`
- `tax_amount`
- `gross_profit`
- `net_profit`
- `net_received_amount`

Field thiếu trả `badge=Missing`, không để UI tự cộng trừ.

## Endpoint đọc chung

- `GET /api/core/shops`
- `GET /api/core/shops/:shopId/summary`
- `GET /api/core/orders/:orderId`
- `GET /api/core/orders/by-conversation/:conversationId`
- `GET /api/core/products/by-sku/:sku`

## Giai đoạn tiếp theo

1. Sau khi deploy Worker chính, chạy sync Shopee hẹp cho 1 shop API bằng route hiện có:
   - `POST /api/orders/sync-api-orders?platform=shopee&shop=<shop>&limit=...`
   - `POST /api/products/sync-api-products?platform=shopee&shop=<shop>&limit=...`
2. Đọc lại cùng đơn/SKU qua `/api/core/*`.
3. So Chat order card với OMS order detail.
4. So SKU trong Chat/order card với Product Master.
5. Mới sau đó chuyển thêm OMS/Product/Dashboard sang đọc các endpoint core nếu cần.

## Kết quả bước đầu 2026-05-18

- Worker chính đã deploy version `c6fc36ec-52e1-4714-8474-f4167598020a`.
- Static UI đã deploy version `6fb0babd-e581-47dd-a6d4-2009c9a45fe3`.
- Chat order card đã đọc Order Core qua `/api/core/orders/by-conversation/:conversationId`.
- Product Master vẫn là nguồn đọc chung; Product Core chỉ adapter đọc `products` và `product_variations`, không tạo bảng mới.
- Shop API `chihuy1984` và shop chưa API `khogiadungcona` đã được kiểm capability qua `/api/core/shops`.
- Cleanup Chat legacy 2026-05-19 đã xóa `fe-chat-marketplace`; các request còn dùng `shop/shop_id/api_shop_id` chỉ ở Chat mới/Core như technical id.

## Rủi ro còn lại

- Chat Worker mới và Worker chính dùng D1 khác nhau, nên Chat UI gọi thêm Worker chính để đọc Order/Product Core.
- Nếu conversation không có mã đơn hoặc buyer identity thì `/api/core/orders/by-conversation/:conversationId` không tự đoán đơn gần nhất.
- Profit/Dashboard route public vẫn giữ để frontend không đổi contract, nhưng số doanh thu/lãi chính đã đọc `order_finance_core`; các route này không còn tự dựng lại Profit by day từ `orders_v2`.
- Legacy Chat marketplace chưa xoá vì còn bridge/readback/media/notification; chỉ cắt khỏi runtime những điểm display shop an toàn.

## Order Finance Contract 2026-05-19

- Order Core/OMS phải đọc Finance taxonomy qua `fee-phase1-core` và `order_analytics.source_json.taxonomy`.
- `orders_v2.revenue` legacy không còn đủ để phân biệt `gross_revenue` với `buyer_total_paid`; khi có raw Payment thì phải lấy product after shop discount, buyer shipping, voucher sàn và buyer paid từ `order_fee_details.raw_data`.
- Hai đơn guard bắt buộc: `260519S5GSW0AV` gross `72.000`, actual `53.745`, profit `19.925`; `260519S77FX1U9` gross `260.900`, platform voucher `41.744`, seller cofund `12.524`, platform funded `29.220`, actual `194.458`.
- PiShip từ API/raw được hiển thị như phí vận hành ngoài ví; Cost Setting chỉ bù khi API không trả field.
# Hotfix vận hành tự động 2026-05-20

- TikTok runner nền phải đi qua local helper control `/tiktok-runner/status|pause|resume|stop`, dùng profile `E:\shophuyvan-python-automation\profiles\browser\shophuyvan-runner-tiktok`, có lock/PID/heartbeat/status, retry/backoff và diagnostic Admin.
- Không dùng profile user `E:\codex-chrome-profiles\shophuyvan-test` cho automation nền; profile này chỉ dùng kiểm UI/production thủ công.
- Không dùng lại profile TikTok bot cũ; `resume` chỉ kiểm API control nếu chưa có cờ cho phép chạy thật.
- Shopee no-API detail runner dùng profile `E:\shophuyvan-python-automation\profiles\browser\HuyVan_Bot_Data_khogiadungcona`; khi chỉ có `order_sn` vẫn phải resolve URL bằng Warehouse hoặc search Seller Center, không tự dựng detail id.
- Status sync tiếp tục chạy ở cron/scheduled, sau import và route `/api/orders/status/sync`; detail runner chạy sau import/status sync; label runner chạy sau import/status sync/backfill theo eligibility.
- Auto label chỉ dùng đường read-only đã xác nhận. Shopee/TikTok manual chưa có đường an toàn thì ghi `manual_required`, không gọi create/ship/arrange/confirm/cancel.
## OMS/Core Hotfix 2026-05-20

- Order Core now owns OMS sync completeness through `order_sync_completeness`; frontend rows must render that field instead of reclassifying every stale/missing timestamp as `Cần đồng bộ`.
- Label retry is operator-driven by date/shop/platform/status via `POST /api/label/retry-failed`. `downloaded` rows are not in the main eligible table unless `force=true`; skipped rows are reported separately.
- TikTok `0909128999` and Shopee no-API `khogiadungcona` manual backfill runs through `POST /api/orders/manual-sync/backfill`, one-shot/small batch only. API shops stay on Open Platform and are not queued to Seller Center fallback.
- Tracking Core is in scope for Order: Shopee uses `/api/v2/logistics/get_tracking_info`, Lazada uses `/logistic/order/trace`, and OMS `Theo dõi` opens the timeline or a short reason (`api_permission_missing`, `seller_center_detail_required`, `tracking_package_missing`).
- Lazada API shop `kinhdoanhonlinegiasoc@gmail.com` keeps revenue from order API and finance/settlement from official Finance endpoints when permission/data exists. If missing, Core marks missing finance instead of upgrading cost setting to confirmed API fee.
- Navigation split is fixed: `Quét mã` is QR packed/cancel/return; `Ghi hình` is CCTV/video packing.

## OMS/Core follow-up 2026-05-20

- TikTok pending settlement now has explicit `Thực nhận tạm tính` in Finance/Core + OMS popup. `actual_income` is not populated from estimates.
- Lazada chat target is no longer treated as unsupported by default; when Shop Core capability is API/bridge, OMS opens Chat Worker and the Lazada bridge uses IM endpoints `/im/session/list`, `/im/message/list`, `/im/message/send`.
- Tracking fallback keeps real cached `tracking_events` visible and labels source as Tracking Core when Open Platform cannot be called.
- Lazada Finance source/endpoint is normalized to `/finance/transaction/details/get` and `lazada.finance.transaction.details.get`.

## Cập nhật 2026-05-21 - Trung tâm tự động theo tính năng

- Trung tâm tự động không còn coi kéo đơn/trạng thái/detail/finance/label là một job mơ hồ. UI/route dùng action riêng: `pull_orders`, `refresh_status`, `sync_detail`, `sync_finance`, `retry_label`.
- `run_report_jobs.py`, local helper `/report-run`, OMS resync panel và Radar legacy guard đã chuyển sang action map mới; `print_label` legacy bị từ chối bằng `legacy_print_label_disabled` và route mới queue `retry_label`.
- `*_don_hang.py` chỉ giữ historical Excel; không dùng cho nút kéo đơn nhanh/auto hằng ngày.
- Mỗi job Chrome phải có profile lock, action lock và order lock; không chạy đồng thời nhiều job đạp cùng profile.
- PASS thật vẫn cần browser lifecycle, import/backfill API call và OMS/Warehouse readback; queued/completed rỗng không được tính pass.

## Cập nhật 2026-05-21 - Sample chuẩn cho Order/Finance/Tracking/Label Core

- TikTok finance `584123080227784403`: automation bắt buộc bấm `Xem chi tiết` trên Finance Transactions, parse panel `Chi tiết quyết toán`, rồi ghi Finance Core `settlement_total/estimated_income=67.755`, `actual_income=null`, `settlement_status=pending_settlement`.
- TikTok detail `584128214410102531`: automation bấm `Thông tin kho vận`, lưu Tracking Core events; bấm reveal customer nhưng nếu vẫn masked thì ghi masked/permission-limited; bấm chat chỉ mở conversation, không gửi live.
- Shopee no-API `260520VPM23704`: Finance Core fixture bắt buộc `product_after_discount=99.000`, `buyer_shipping_paid=8.000`, `platform_voucher=21.780`, `seller_cofunded_voucher=6.534`, `buyer_paid=85.220`, `actual_income=70.030`. Không lấy `85.220` làm doanh thu sản phẩm.
- Retry label sample TikTok `584123080227784403`: đường đúng là `retry_label -> taitem.py -> Label Core`; kết quả pass khi dry-run eligible, job live completed, PDF hợp lệ và readback `label_status=downloaded`.
- Lazada API tiếp tục dùng Worker/Open Platform order/status/trace/label; finance chưa có settlement confirmed thì giữ `Lãi tạm tính`, không gọi Chrome fallback.
