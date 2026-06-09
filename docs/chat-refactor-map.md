# Bản đồ refactor Chat/CSKH

Ngày lập: 2026-05-19

## Cập nhật profile automation 2026-05-21

- Chat/CSKH không dùng Chrome automation profile để gửi/đọc tin. Profile audit lượt này chỉ phục vụ OMS/local runner và Seller Center manual check.
- Lazada profile mới `E:\shophuyvan-python-automation\profiles\browser\HuyVan_Bot_Data_lazada_kinhdoanhonlinegiasoc` chỉ dùng user đăng nhập/kiểm thủ công; Chat Lazada production vẫn phải đi Chat Worker/Lazada IM bridge nếu có quyền.
- Shopee/Lazada API shop trong profile map là `automation_allowed=false`, `source=api`; Chat không được suy diễn Seller Center fallback cho các shop này.

## Hotfix vận hành auto kéo đơn/trạng thái 2026-05-20

- Chat/CSKH không điều khiển scheduler auto. Nếu cần hiển thị trạng thái đơn, Chat chỉ đọc Order/Warehouse Core sau khi Worker Cron hoặc Radar/local helper ghi dữ liệu.
- Shop API (`chihuy1984`, `chihuy2309`, `phambich2312`, Lazada `kinhdoanhonlinegiasoc@gmail.com`) tự sync nền bằng Worker/Cron/Webhook; Chat không gắn nguồn Seller Center/Radar cho các shop này.
- Worker cron API không tự queue Chrome fallback cho shop no-API và không gửi push live trong lượt auto order/status; Chat chỉ đọc kết quả Core sau khi Worker/Radar ghi xong.
- RADAR chỉ dành cho no-API/local fallback. Diagnostic auto nằm ở OMS modal và local helper, gồm last/next/result/error; Chat không gọi `Đánh thức ngay`, không sync Payment live, không gửi tin live và không gọi marketplace action.
- TikTok auto nền hiển thị runtime hiện tại từ OMS/local helper; nếu user bật và runner không paused thì Radar có thể queue batch nhỏ an toàn. Chat chỉ đọc kết quả Core, không tự điều khiển runner.

## Hotfix production OMS/Core 2026-05-20

- Chat nếu đọc order card từ Core phải dùng cùng `order_sync_completeness`, `profit_label`, `tracking_number` và source resolver như OMS. Không tự hiển thị `Lãi thực` cho Lazada khi Finance API chưa confirmed.
- Lỗi Seller Center cũ trên API shop chỉ là stale diagnostic; Chat/CSKH không được dùng lỗi đó để gắn `Cần đồng bộ Seller Center` hoặc nguồn Seller Center cho `chihuy1984/chihuy2309/phambich2312/kinhdoanhonlinegiasoc@gmail.com`.
- Chat không dùng panel đồng bộ, không gọi label retry, không gửi tin live và không sync Payment live; mọi thông tin vận hành lấy lại từ Warehouse/Core sau khi OMS/Worker cập nhật.

## Cụm vận hành OMS Đồng bộ & tải lại 2026-05-20

- Chat/CSKH không chạy cụm này. Panel `Đồng bộ & tải lại` thuộc OMS/Admin và chỉ thao tác Order/Label Core qua Worker chính.
- Chat nếu hiển thị đơn chỉ đọc kết quả đã chuẩn hóa từ Warehouse/Core: `label_status`, `last_label_error`, `seller_center_detail_url`, `status_source`, `source_label`, `last_status_sync_error`. Không gọi `POST /api/label/retry-failed` hoặc `POST /api/orders/manual-sync/backfill`.
- Source hiển thị trong Chat phải theo resolver giống OMS: API shop là `API`, `khogiadungcona` là Seller Center fallback, TikTok là manual/local helper fallback. Không được hiển thị `Seller Center` cho shop API chỉ vì dữ liệu cũ có lỗi Seller Center.
- Không gửi tin live, không sync Payment live, không parse Seller Center và không gọi fulfillment action từ Chat. Nếu Chat cần giải thích lỗi tem/status thì dùng message ngắn từ Core, technical detail giữ trong diagnostic.

## Hotfix OMS source/label API 2026-05-20

- Chat/CSKH không chạy hotfix này nhưng phải đọc trạng thái mới từ Order Core nếu hiển thị đơn: `source_label`, `source_priority`, `seller_center_allowed`, `docs_checked`, `api_missing_reason`, `source_mismatch`, `label_status`, `label_reason`, `last_label_error`.
- Shop có API phải hiện nguồn `API` khi Chat đọc order card từ Core; không được hiển thị `Seller Center` cho `chihuy2309/chihuy1984/phambich2312` chỉ vì dữ liệu cũ có `seller_center_detail_url_not_found`.
- Shopee API label có thể ở trạng thái `pending_document_generation` khi Worker đã gọi flow chứng từ in chính thức và đang chờ PDF; Chat chỉ hiển thị, không gọi refresh/backfill.
- Lazada label có thể ở trạng thái `pending_retry/lazada_batch_requeued` khi Worker chia batch vì giới hạn subrequest; Chat chỉ đọc reason ngắn, không gọi API Lazada.
- Chat vẫn không gửi tin live, không sync Payment live, không gọi Seller Center detail parser, không gọi label refresh/backfill và không gọi fulfillment action.

## Cleanup ranh giới Chat với status/detail/label 2026-05-20

- Chat vẫn chỉ đọc Order/Finance Core; không gọi status sync, Seller Center parser, label refresh/backfill hoặc route legacy.
- Legacy `/api/labels/refresh/*` vẫn là 410 ở Worker chính; Chat không có caller route này. Label/status diagnostic nếu cần hiển thị phải đọc từ read model Core (`label_status`, `last_label_error`, `last_status_sync_error`, `seller_center_detail_url`).
- Guard `test-legacy-flow-locks` bổ sung để chặn frontend khôi phục caller route cũ hoặc gọi marketplace action trong workflow status/detail/label.

## Cập nhật ranh giới Chat với realtime status, Seller Center detail và auto label 2026-05-19

- Chat/CSKH không chạy status sync, không parse Seller Center và không tải tem. Chat chỉ đọc read model Order/Finance Core đã chuẩn hóa từ Worker chính để hiển thị `display_status_vi`, `status_source`, `last_status_sync_at`, `last_status_sync_error`, `label_status`, `label_reason`, `seller_center_detail_url` nếu backend trả.
- Status realtime thuộc Order Core: cron `scheduled()`, sau `importOrdersV2()` và route `POST /api/orders/status/sync` cập nhật `orders_v2`, sau đó Chat đọc lại qua `/api/core/orders/by-conversation/*` hoặc các route Order Core tương ứng.
- Shopee no-API `khogiadungcona` detail fallback thuộc Order Worker/local helper: `/api/orders/shopee-seller-detail/eligible|queue|backfill|diagnostic` và action `sync_detail` qua `dongbochitiet.py`. Nguồn `shopee_seller_center_detail` không được gọi là API trong Chat UI hoặc reply AI.
- Seller Center URL chỉ được dùng khi backend đã resolve/verify từ Warehouse hoặc Seller Center search. Chat không tự dựng `/portal/sale/order/<order_sn>` và không tự sửa `seller_center_detail_id/url`.
- Auto label thuộc Order/Label runner `backfillEligibleLabels()` và `POST /api/label/backfill-eligible`, được gọi sau import/status sync/cron. Chat chỉ hiển thị `Đang chờ tải tem`, `Đã tải tem`, `Lỗi tải tem`, `Cần tải thủ công`, `Chưa hỗ trợ tải tem` nếu dữ liệu này đi qua Order Core.
- Chat vẫn không gửi tin live trong workflow status/detail/label; không gọi Payment sync, không gọi marketplace create/ship/arrange/cancel/confirm và không dùng route legacy `/api/labels/refresh/*`.

## Cập nhật ranh giới Chat với Order Status Core 2026-05-19

- Chat không tự map trạng thái đơn. Order-link trong Chat đọc `/api/core/orders/by-conversation/*` và hiển thị `display_status_vi/status_label_vi` từ Order Core; không fallback raw `status_raw` để dịch trạng thái.
- Nếu Chat cần hiển thị trạng thái vận chuyển hoặc label, dữ liệu phải đi qua `normalizeOrderReadModel()` trước. Field sẵn có: `raw_platform_status`, `order_status_core`, `fulfillment_status_core`, `display_status_vi`, `terminal_status`, `label_eligible`, `label_status`, `label_reason`, `shipping_label_url`, `label_file_path`, `last_label_download_at`, `last_label_error`, `label_download_mode`, `label_download_supported`, `label_download_source`, `label_download_reason`, `label_download_read_only`, `label_download_requires_manual`.
- `order_type=return` nhưng raw status `COMPLETED` được xử lý ở read model thành `Hoàn / trả`; Chat không cần backfill riêng và không mutate dữ liệu đơn.
- Auto tải tem không thuộc Chat runtime. Chat chỉ đọc reason/trạng thái/capability từ Order Core; không gọi trực tiếp `POST /api/label/:orderId/refresh` hoặc `POST /api/label/backfill-eligible`, không gọi legacy `/api/labels/refresh/*`, không gửi tin live và không gọi marketplace action.
- Capability hiện hành: Shopee API và Lazada API chỉ có thể tải tem khi Core xác nhận read-only; Shopee no-API/manual và TikTok trả `manual_required`; sàn/shop chưa chứng minh helper an toàn trả `not_supported` hoặc reason rõ để Chat chỉ hiển thị, không thao tác.

## Cập nhật ranh giới TikTok Finance/Chat 2026-05-19

- Lượt TikTok Seller Center detail không sửa Chat/CSKH và không gửi tin live.
- Nếu Chat cần số tiền/lãi TikTok, Chat phải đọc Order/Finance Core đã chuẩn hóa; không tự lấy `Tổng cộng` làm lãi và không tự cộng phí vận chuyển người mua trả vào lãi tạm tính.
- Mapping dùng chung: `Tổng cộng` là Tổng doanh thu báo cáo / Người mua thanh toán; `Tổng các mặt hàng sau khi giảm giá` hoặc `Tổng (các) mặt hàng sau khi giảm giá` là Tiền sản phẩm sau KM shop và là basis `Lãi tạm tính`; `Phí vận chuyển sau khi giảm giá` chỉ đối soát doanh thu; `Số tiền bạn kiếm được` nếu có là Thực nhận ví.
- Nếu Chat sau này cần giải thích số TikTok, chỉ đọc kết quả đã được parser/runner mở `Hiển thị chi tiết` và ghi vào Order/Finance Core; Chat không tự parse Seller Center.
- TikTok chưa có API order/token chính thức trong hệ thống; dữ liệu detail vào `order_fee_details.raw_data.tiktok_seller_center_detail` qua local parser/backfill read-only rồi Finance Core rebuild `order_analytics`.
- Runner/backfill chạy theo eligibility/batch nhỏ sau import đơn mới và sau status check pending settlement; không quét toàn bộ TikTok mỗi cron.
- Guard 2026-05-19: Chat nếu đọc lãi TikTok từ Core sẽ thấy `Lãi tạm tính` khi `actual_income_available=false`; khi Core đã có actual confirmed, runner sau không được hạ số này về `NULL`.

## Cập nhật ranh giới Finance/Chat 2026-05-19

- Lượt taxonomy này không làm lại Chat/CSKH và không gửi tin live.
- Nếu Chat cần hiển thị phí/lãi đơn, Chat vẫn phải đọc Finance Core/Order Core đã chuẩn hóa; không tự tính voucher shop, phí sàn hoặc lãi trong frontend Chat.
- `shop_discount`/voucher shop không thuộc `Phí sàn`; mọi card đơn hàng dùng chung nhãn với OMS/Profit/Dashboard/Export.
- Popup phí thuộc OMS, không thuộc Chat runtime. Trạng thái mới là click-to-open/pinned theo `order_id`, không hover-only.
- Không gọi marketplace send/sync nguy hiểm và không sync Payment live trong lượt này.
- Production deploy liên quan chỉ là Worker chính `cc96348c-ebcb-441a-852e-03be377435eb` và static UI `1e47c9f4-14ab-48bc-9c16-406d42296b02`; không deploy Chat Worker.

## Cập nhật hotfix OMS `Nhắn khách` bằng Chat mới 2026-05-19

Hotfix này khôi phục hành động `Nhắn khách` trong OMS order list/detail theo Chat/CSKH mới, không restore Chat legacy.

- OMS:
  - `apps/fe/js/modules/oms-render.js` render lại nút `Nhắn khách` bằng hook mới `data-open-customer-chat`.
  - `apps/fe/js/modules/oms-chat-actions.js` là handler mới: chỉ gọi Core read route, không gọi `/api/chat/resolve-order-conversation`, không dùng `openOrderChatResolver()`, không gửi tin live.
  - `apps/fe/js/features/oms-dashboard/oms-dashboard-inline-1.js` khởi tạo handler mới; `apps/fe/css/oms-dashboard/orders-table.css` giữ nút compact trên desktop/mobile.
- Resolve order -> chat:
  - Worker chính thêm `GET /api/core/orders/:orderId/chat-target`, đọc `Order Core + Shop Core` trong `apps/worker-api/src/core/shared-data/order-chat-target-core.js`.
  - Route trả `platform/channel`, `shop_id`, `customer_id`, capability chat và reason; không đọc/ghi bảng Chat legacy.
  - OMS chỉ redirect sang `chat-cskh.html?source=oms&order_id=...&context_tab=orders...` khi shop/platform có thể mở Chat mới.
- Chat mới:
  - `apps/fe/js/dashboard/chat/deep-link.js`, `sync.js`, `order-link.js`, `render.js`, `products.js` xử lý URL từ OMS.
  - Nếu tìm được conversation trong Chat Worker `/api/chat/conversations`, Chat mới mở đúng thread rồi tab `Đơn` ưu tiên mã đơn từ OMS.
  - Nếu chưa có conversation, Chat mới vẫn hiển thị order context từ `/api/core/orders/by-conversation/*` và tab `Sản phẩm` đọc Product Core; composer vẫn disabled, không gửi tin.
- Platform behavior:
  - Shopee shop có Chat API/bridge: mở Chat mới và resolve conversation theo `shop_id + customer_id` nếu có.
  - Shopee shop chưa bật Chat API: hiện `Shop chưa bật Chat API`.
  - Lazada shop có Chat API/bridge: mở Chat mới và resolve conversation qua Lazada IM (`/im/session/list`, `/im/message/list`, `/im/message/send`); nếu thiếu token/quyền thì hiện `Lazada Chat API thiếu token/quyền IM`.
  - TikTok/manual/import: không fake gửi thành công; hiện manual/local helper rõ như `TikTok cần mở chat thủ công/local helper` hoặc `Shop manual/import không hỗ trợ chat tự động`.
- Legacy guard:
  - Không restore `chat-marketplace.html`, `fe-chat-marketplace/*`, `worker-chat-marketplace/*`.
  - Worker chính `/api/chat/*` vẫn chỉ trả 410 `legacy_chat_route_disabled`; Chat mới vẫn dùng Chat Worker riêng.

## Cập nhật hotfix tab Sản phẩm 2026-05-19

Hotfix này khôi phục phần `Sản phẩm` và hành động `Gửi thẻ sản phẩm` cho Chat/CSKH mới sau khi xóa legacy, nhưng không restore bất kỳ runtime Chat legacy nào.

## Cập nhật Lazada order chat 2026-05-20

- OMS `Nhắn khách` cho Lazada API shop được mở lại theo capability thật từ Shop Core, không còn reason chung `chưa hỗ trợ`.
- Chat Worker Lazada adapter gọi bridge chính thức của Worker chính; bridge dùng Lazada IM `/im/session/list`, `/im/message/list`, `/im/message/send`.
- Nếu thiếu chat token/quyền IM, route trả `token_scope_missing` hoặc lỗi Lazada Chat API rõ; không fake `sent`.
- TikTok vẫn manual/local helper cho tới khi có API chat chính thức hoặc helper an toàn.

- Frontend:
  - `apps/fe/pages/chat-cskh.html` thêm tab `Sản phẩm`.
  - `apps/fe/js/dashboard/chat/products.js` render Product tab, search, related products và capability reason.
  - `apps/fe/js/dashboard/chat/order-link.js` cho phép context tab `products`; `events.js` bắt search/click gửi product card.
- Product context:
  - Sản phẩm liên quan lấy từ Order Core mới qua `/api/core/orders/by-conversation/:conversationId`.
  - Tìm kiếm lấy từ Product Core mới qua `/api/core/products/search`; kiểm trước khi gửi bằng `/api/core/products/by-sku/:sku`.
  - Product Knowledge chỉ được đọc qua Worker chính Core search, không đọc bảng/route Chat legacy.
- Send product card:
  - Chat Worker thêm `POST /api/chat/product-cards/send` trong `apps/chat-worker-api/src/routes/product-cards.js`.
  - Core gửi nằm ở `apps/chat-worker-api/src/core/product-card-core.js`: kiểm conversation, kiểm Product Core, kiểm capability, hỗ trợ `dry_run`, không fallback text.
  - Shopee adapter gọi Worker chính bridge mới `POST /api/internal/chat-bridge/shopee/messages/product-card`; bridge thử SellerChat `message_type=item` rồi `product`.
- Platform behavior:
  - Shopee enable khi `send_capability` là `official_api` hoặc `bridge`, bridge đã cấu hình, và product có item id.
  - Lazada/TikTok/manual/import disable với reason rõ; không fake product card và không gửi live trong test.
- Legacy guard:
  - Không restore `apps/fe/js/dashboard/fe-chat-marketplace/*`, `chat-marketplace.html`, `worker-chat-marketplace/*`.
  - Worker chính `/api/chat/*` legacy vẫn phải trả 410; Chat Worker riêng `/api/chat/*` là hệ mới.
  - Production network của `chat-cskh.html` không được load `fe-chat-marketplace`.
- Deploy/verify:
  - Worker chính `huyvan-worker-api`: `3a8ad03b-a557-4d0c-a149-d60445665e2f`.
  - Chat Worker `shophuyvan-chat-api`: `76fc53b2-e0df-4c8d-9f2b-d1e974a8c42b`.
  - Static UI `shophuyvan-analytics`: `54d8476a-bf9e-4a45-8a6e-49520110f49e`.
  - Chrome profile `E:\codex-chrome-profiles\shophuyvan-test`: desktop `1366x900`, tablet `820x1180`, mobile `390x844` pass tab `Sản phẩm`, search `HV999K241300S`, manual reason, no overflow, no legacy network, no product card send click.
  - API pass: Worker chính `/api/chat/context` và `/api/chat/conversations` 410; Chat Worker `/api/chat/health` 200; Product Core `by-sku/search` 200; product-card dry-run 200 và `sent_to_platform=false`.

## Cập nhật xóa/cắt hẳn Chat legacy 2026-05-19

Lượt này thay đổi trạng thái cleanup: không giữ legacy chỉ vì còn caller. Caller mới chuyển sang Chat mới/Core, caller cũ bị xóa, route cũ public bị 410 rõ ràng.

### Frontend đã xóa khỏi runtime

- Xóa `apps/fe/pages/chat-marketplace.html`.
- Xóa `apps/fe/js/dashboard/chat-marketplace-page.js`.
- Xóa `apps/fe/js/dashboard/fe-chat-marketplace-loader.js`.
- Xóa toàn bộ `apps/fe/js/dashboard/fe-chat-marketplace/*`.
- Cắt link `chat-marketplace.html` khỏi landing, dashboard, Profit, Reviews, Zalo chat và service worker; các link còn lại trỏ `chat-cskh.html`.
- Xóa caller OMS `openOrderChatResolver()`/`data-chat-order-open` nên không còn nhánh mở `/api/chat/resolve-order-conversation`.
- Service worker không còn fallback fetch `/api/chat/notifications/latest`.
- Các action Lazada Chat cũ trong Shop Admin đã bị bỏ khỏi UI; route backend tương ứng trả 410.

### Backend đã xóa hoặc disable

- Xóa `apps/worker-api/src/routes/worker-chat-marketplace/*`.
- Xóa `apps/worker-api/src/core/chat/*`.
- `/api/chat/*` trên Worker chính chỉ còn route 410 `legacy_chat_route_disabled` trong `apps/worker-api/src/routes/marketplace-chat/index.js`.
- `/api/auth/lazada/chat/url` và `/channels/lazada/chat/callback` trả 410 `legacy_chat_auth_disabled`.
- `/api/shops/disconnect-chat-api` trả 410 `legacy_chat_disconnect_disabled`.
- `recordChatWebhook()`, `runChatAiAutoReplyBatch()`, `notifyChatSubscribers()` và `notifyOrderSubscribers()` còn là export tương thích nhưng bị disable, không gửi notification/AI auto reply và không mutate Chat legacy.
- Product knowledge sync chuyển sang `apps/worker-api/src/core/products/product-knowledge-core.js`, không import Chat legacy.

### Route giữ lại vì thuộc Chat mới

- `apps/chat-worker-api/src/index.js` tiếp tục phục vụ `/api/chat/health`, `/api/chat/settings`, `/api/chat/conversations`, `/api/chat/messages`, `/api/chat/messages/send`, `/api/chat/sync`, `/api/chat/ai/suggest`, `/api/chat/attachments` trên Worker Chat riêng. Đây là Chat mới.
- `apps/worker-api/src/routes/marketplace-chat/shopee-bridge.js` giữ `/api/internal/chat-bridge/shopee/sync` và `/api/internal/chat-bridge/shopee/messages/send` để Chat Worker mới gọi SellerChat API chính thức. Bridge không ghi bảng Chat legacy, không dùng `worker-chat-marketplace`, không tự enrich Shop/Product/Order/Finance.
- `GET /api/internal/chat-bridge/shopee/conversations*` trả 410 `legacy_bridge_read_disabled`; list/messages phải qua Chat Worker mới.
- Chat mới lấy Shop/Product/Order/Finance từ Core: `/api/core/shops`, `/api/core/products/by-sku/*`, `/api/core/orders/by-conversation/*` và Finance Core/`order_analytics` khi cần số tiền.

### Deploy và kiểm production

- Worker chính `huyvan-worker-api`: `04e42159-a24d-49e9-9e6e-eaea13b7c59b`.
- Static UI `shophuyvan-analytics`: `8c3807de-197a-4daa-81e1-3eb1ac697990`.
- Chat Worker `shophuyvan-chat-api`: không deploy trong lượt này, chỉ chạy test vì không sửa service mới.
- Chrome profile `E:\codex-chrome-profiles\shophuyvan-test`: desktop `1366x900`, tablet `820x1180`, mobile `390x844` đều mở `chat-cskh.html`, load `46/46` hội thoại, click hội thoại và tab `Đơn` thành công.
- Network production: không request `fe-chat-marketplace`, không request `/api/chat/*` của Worker chính, có request Chat Worker `/api/chat/*` và Core `/api/core/orders/by-conversation/*`.
- API production: `/api/chat/context` và `/api/chat/conversations` trên Worker chính trả `410 legacy_chat_route_disabled`; bridge read cũ trả `410 legacy_bridge_read_disabled`; Finance Core ngày `2026-05-18` còn `status=ok`.

Các mục lịch sử bên dưới còn ghi "legacy giữ lại" là trạng thái trước cleanup này, không còn là trạng thái hiện hành.

## Cập nhật tổng vệ sinh runtime đọc dữ liệu 2026-05-19

Phạm vi lượt này không gửi tin live và không deploy/sửa Chat Worker mới. Cleanup chỉ khóa runtime đọc dữ liệu trong Worker chính và cắt legacy bị nạp sai.

Deploy/verify liên quan:

- Worker chính `huyvan-worker-api`: `5758ca3f-b27d-4c73-bfc1-bbd1885e21f0`; static UI: `697c6142-e9c4-465f-8beb-12b5923616d9`.
- Không deploy Chat Worker vì không sửa service Chat mới; vẫn chạy `npm test` Chat Worker để kiểm syntax.
- Probe cũ `/api/chat/context` đã bị thay bằng 410 trên Worker chính; Chat mới đọc order context qua `/api/core/orders/by-conversation/*`.
- Profit Dashboard production bằng profile `E:\codex-chrome-profiles\shophuyvan-test` không còn `tab-chat`, không nạp `fe-chat-marketplace-loader.js`, không sinh global Chat marketplace.

- Chat mới: `apps/fe/pages/chat-cskh.html` đọc conversation/message từ `apps/chat-worker-api`, còn order/product/shop/finance lấy từ Worker chính qua `/api/core/orders/by-conversation/*`, `/api/core/products/by-sku/*`, `/api/core/shops`.
- `apps/fe/js/dashboard/chat/order-link.js` giữ vai trò link Order Core; không tự map status/fee/product trong frontend.
- Chat legacy `/api/chat/context`, display-card enrich và resolver không còn runtime; Worker chính trả 410 cho `/api/chat/*`.
- Item/order/product context của Chat mới đọc qua Core API, không fallback vào context legacy.
- `profit-dashboard.html` chỉ còn link sang trang Chat riêng, không nạp runtime Chat marketplace trong nền.
- Đã xóa `chat-marketplace.html`, `fe-chat-marketplace/*` và caller `apps/fe/js/modules/oms-actions.js` mở trang legacy.
- Rule giữ nguyên: không dùng raw numeric Shopee/Lazada ID làm tên shop chính; không merge same-SKU khác biến thể/tên/tiền/số lượng; nếu cần phí/lãi cho Chat phải đọc Finance Core/`order_analytics`, không dùng Profit/Income legacy.

## Cập nhật Shop Display Core 2026-05-18

- Thêm `apps/chat-worker-api/src/core/shop-display-core.js`: Chat Worker chỉ đọc Shop Core từ Worker chính, không tạo bảng tên shop riêng.
- `apps/chat-worker-api/src/routes/conversations.js` enrich response conversation bằng `shop_display_name`, `shop_name_source`, `shop_profile_source`, `shop_name_missing`.
- `apps/fe/js/dashboard/chat/render.js` và `order-link.js` render tên shop bằng `shop_display_name`; raw numeric `shop_id` không còn là label chính cho Shopee.
- `apps/fe/js/dashboard/chat/sync.js` cũng dùng `shopDisplayLabel()` cho trạng thái đồng bộ; `shop_id` chỉ còn dùng trong payload kỹ thuật gửi tới Chat Worker.
- Worker chính lưu snapshot profile tại `shop_core_profiles`; helper chuẩn hóa nằm trong `apps/worker-api/src/core/shops/shopee-profile-core.js`.
- Nếu Shop Core trả thiếu tên hoặc trả tên dạng raw/synthetic, Chat Worker chuyển về `Shop chưa đồng bộ tên` và giữ badge `Thiếu tên shop`.
- Legacy `worker-chat-marketplace` đã xóa; bridge/readback Shopee mới nằm ở `routes/marketplace-chat/shopee-bridge.js` và tên shop cho Chat/CSKH mới đi qua Shop Core.
- `apps/fe/js/dashboard/fe-chat-marketplace/*` đã xóa khỏi runtime thay vì tiếp tục vá label legacy.
- Các field `conversation.shop`, `conversation.shop_id`, `shop.api_shop_id` vẫn được giữ trong payload kỹ thuật để gọi API đúng shop, không dùng làm display name chính.
- Production 2026-05-18: conversation API trả `shop_display_name=GIA DỤNG HUY VÂN` cho `shop_id=170044686` và `shop_display_name=shophuyvan.vn` cho `shop_id=166563639`; `shop_name_source=shopee_shop_api`, `shop_name_missing=false`.
- Deploy Shop Warehouse guard mới: Worker chính `d8e7ae88-a31e-4e2c-8b71-3a95bb4872b3`, Chat Worker `ff2d5b00-9bdb-4f6e-be0f-9825a95875af`, static UI `06d47676-37f9-4a24-a704-646f67e683ae`.
- UI production đã kiểm bằng Chrome profile ShopHuyVan ở `1366x900`, `820x1180`, `390x844`; badge capability không mất và không phát sinh duplicate message trong thread kiểm.

## Cập nhật Core Data 2026-05-18

- Thêm Worker chính `apps/worker-api/src/routes/core-data/index.js` và `apps/worker-api/src/core/shared-data/core-data-core.js` để tạo nguồn đọc chung Shop/Order/Product/Finance cho Chat/OMS.
- Chat UI mới không còn câu `Chưa nối Order/Product Core`; tab `Đơn` gọi `GET /api/core/orders/by-conversation/:conversationId` rồi render Order Core, item/SKU và badge nguồn dữ liệu.
- `apps/fe/js/dashboard/chat/api.js` tách `chatApi()` cho Chat Worker và `coreApi()` cho Worker chính; production mặc định `SHOPHUYVAN_CORE_API_BASE=https://huyvan-worker-api.nghiemchihuy.workers.dev`.
- Legacy `worker-chat-marketplace` đã xóa; bridge Shopee hiện là module mới không phụ thuộc context legacy.
- File mapping chi tiết mới: `docs/core-data-map.md`, kế hoạch nối tiếp: `docs/shop-order-product-core-plan.md`.
- Deploy verify: Worker chính `c6fc36ec-52e1-4714-8474-f4167598020a`, static UI `6fb0babd-e581-47dd-a6d4-2009c9a45fe3`; Chrome profile `E:\codex-chrome-profiles\shophuyvan-test` pass desktop/tablet/mobile cho tab `Đơn`.

## Cập nhật Finance Warehouse/Core 2026-05-18

- Lượt Finance không sửa Chat Worker và không gửi tin live.
- Chat order card tiếp tục đọc Order/Product/Finance qua `/api/core/orders/by-conversation/*`; nếu cần số phí/lãi thì nguồn chuẩn là `order_fee_details` và `order_analytics`, không lấy lại helper Profit/Income legacy.
- Profit/Dashboard/Export đã chuyển read-path tài chính sang `order_finance_core`/`order_analytics`; vì vậy Chat không được tạo công thức phí/lãi riêng khi reuse số liệu cho hội thoại.
- `/api/income/*` giữ vai trò lấy nguồn Payment/Finance/readback, không gọi từ Chat UI như nguồn hiển thị lãi lịch sử.
- Lượt này chỉ deploy Worker chính `3605a561-cb25-41eb-be05-25234e1a961b` và static UI `c5da67a2-c3f4-4e9b-8fed-93515743d3a0`; không deploy Chat Worker, không gửi tin live.

## Cập nhật Order Warehouse/Core 2026-05-19

- Chat đang dùng hướng mới theo xác nhận vận hành; lượt Chat legacy cleanup đã xóa `worker-chat-marketplace` và không gửi tin live.
- Chat UI mới vẫn đọc order qua `apps/fe/js/dashboard/chat/order-link.js` -> `GET /api/core/orders/by-conversation/:conversationId`.
- Worker chính đã gom Order read model vào `apps/worker-api/src/core/orders/read-core.js`; `/api/core/orders/*` nhận `status_label_vi`, `order_status_core`, `source`, `confidence`, `badge` từ cùng helper với OMS wrapper.
- OMS nút legacy `Nhắn khách` không còn gọi `/api/chat/resolve-order-conversation`; caller cũ đã xóa thay vì giữ bridge legacy.
- `chat-marketplace.html` đã xóa; điều kiện hiện tại là production phải tiếp tục pass trên `chat-cskh.html` và Worker chính phải trả 410 cho `/api/chat/*` cũ.

## Cập nhật duplicate order_items legacy 2026-05-19

- Chat không đổi luồng gửi/đọc tin, không gửi tin live và không sửa UI trong lượt duplicate `order_items`.
- Order card của Chat vẫn đọc Order Core qua `/api/core/orders/by-conversation/*`; nguồn item chuẩn là `orders_v2/order_items`, số tài chính chuẩn đọc từ `order_analytics` khi cần.
- Duplicate exact trong `order_items` được chặn ở Worker chính qua `apps/worker-api/src/routes/orders/order-items-dedupe.js` gọi từ `importOrdersV2()`. Chat không được tự dedupe item trên UI.
- Cleanup production đã xóa `18` dòng duplicate exact sau khi backup, rebuild Finance/Core với `sync_payment=false`; các dòng cùng SKU nhưng khác biến thể/tên/tiền vẫn giữ để Chat hiển thị đúng hàng thật trong đơn.

## Cập nhật Order auto scan 2026-05-19

- Chat không đổi luồng gửi/đọc tin trong lượt này và không gửi tin live.
- Order card/chat order-link vẫn đọc Order Core qua `/api/core/orders/by-conversation/*`; dữ liệu đơn sau scan phải đi vào `orders_v2/order_items/order_fee_details` trước.
- Shop có API order tự quét qua Open Platform API; shop không API và TikTok chưa có API order chỉ có `browser_sync`, `import_file_sync` hoặc `manual_reference` có log, không ghi nhãn API.
- `marketplace_shop_capability_core` expose `order_sync_mode` và diagnostic quét đơn để UI/admin thấy nguồn đơn của từng shop; Chat nếu cần hiển thị trạng thái shop phải dùng field này thay vì tự đoán từ platform.
- Runner diagnostic nằm ở Shop capability, gồm runner name/schedule/running source/status. Chat hoặc OMS chỉ được đọc field này; TikTok/manual shop nếu local helper/report_worker không chạy phải hiện `Chưa có runner tự động`, không im lặng và không suy luận API.

## Cập nhật UI Duoke 2026-05-18

- `apps/fe/pages/chat-cskh.html`, `apps/fe/css/dashboard/chat.css`, `apps/fe/js/dashboard/chat/render.js`, `events.js`, `sync.js`, `state.js`, `order-link.js` đã được sửa theo workflow Duoke: rail kênh, inbox có search/unread, thread chat, composer dưới cùng, panel khách/đơn/trạng thái.
- Khác Duoke có chủ đích: UI chỉ bật Shopee trong lượt này; các kênh ngoài phạm vi không được gọi backend. AI không còn được đặt làm tab vận hành trong UI mới của lượt này.
- `sync.js` chỉ gọi `POST /api/chat/sync` khi tìm được conversation Shopee có `sync_capability=polling_api` và truyền `shop_id`; shop manual như `khogiadungcona` chỉ hiển thị manual/import, không bị gọi SellerChat API.
- Attachment live chưa bật: UI gắn badge `Attachment chưa bật`, nút `Tệp` chỉ báo `attachment_bridge_not_ready`, không tạo success giả.
- Static UI production version mới nhất: `06d47676-37f9-4a24-a704-646f67e683ae`; Worker Chat và Worker chính không deploy trong lượt cleanup display legacy này.
- Production verification: desktop `1366x768`, tablet `768x1024`, mobile `390x844` pass bằng Chrome profile `E:\codex-chrome-profiles\shophuyvan-test`.
- Legacy không còn giữ: `chat-marketplace.html`, `fe-chat-marketplace/*`, route legacy Worker chính đã bị xóa hoặc 410. `rg` runtime chỉ được phép còn Chat Worker mới và docs lịch sử.

## Mục tiêu

Tách Chat/CSKH thành service riêng `apps/chat-worker-api` và UI mới `apps/fe/js/dashboard/chat`, giữ hệ thống cũ ở trạng thái legacy/fallback cho đến khi route mới, UI mới, gửi tin, sync và production verification đều pass.

## Chiến lược deploy hiện tại

- Code Chat/CSKH vẫn ở mono-repo `shophuyvan-analytics`.
- GitHub repo hiện tại được phép là `skymax2309/shophuyvan-analytics`; repo riêng `zacha030596-dev/shophuyvan-chat` là hướng tương lai, chưa dùng làm blocker.
- Cloudflare deploy bắt buộc dùng profile riêng `shophuyvan-chat-api`, Worker `shophuyvan-chat-api`, D1 `shophuyvan-chat-db`, R2 `shophuyvan-chat-files`.
- Khi deploy Chat chỉ chạy từ `apps/chat-worker-api`, không deploy Worker chính OMS/Dashboard/Finance/Product.
- UI production đã expose ở `https://shophuyvan-analytics.nghiemchihuy.workers.dev/pages/chat-cskh.html`; deploy static từ `apps/fe` không chạy `apps/worker-api`.
- UI production mặc định gọi Chat Worker riêng `https://shophuyvan-chat-api.zacha030596.workers.dev`, không gọi nhầm Worker chính.
- Chat Core là một hệ thống chung; shop có API và shop không API chỉ tách bằng capability `shop_chat_mode`, `send_capability`, `sync_capability` theo `channel + shop_id`.
- Production 2026-05-18 đã deploy lại Worker Chat version `15b7d0bb-5d48-4897-9dea-ec35a69a556b` và static UI version `1d776058-82ed-4d25-ab55-17ddc9fe8d41`.
- Shopee bridge text live đã nối qua Worker chính version `233760a9-2469-4792-8b0d-284457d8f81c`, endpoint nội bộ `POST /api/internal/chat-bridge/shopee/messages/send`, auth bằng secret. Lý do deploy Worker chính: helper `sendShopeeChatOfficial`, token shop Shopee và readback legacy vẫn nằm ở Worker chính.
- Live send qua Chat Worker mới pass và Shopee trả `platform_message_id=2414019124426817905`. Readback legacy đã pass bằng SellerChat API `get_conversation_list` + `get_message`, timestamp Shopee được normalize an toàn và Chat Worker không tạo duplicate theo platform id này.
- Full inbox polling Shopee đi qua `POST /api/chat/sync` của Chat Worker -> `POST /api/internal/chat-bridge/shopee/sync` của Worker chính -> `GET /api/v2/sellerchat/get_conversation_list` -> `GET /api/v2/sellerchat/get_message` cho conversation mới hoặc changed. Chat Worker merge theo `platform_message_id`, cập nhật sync state và không fake success khi Shopee trả lỗi quyền/rate limit.

## Kết luận audit nhanh

- Trạng thái trước cleanup: Chat cũ từng chia giữa frontend `fe-chat-marketplace`, page Zalo, route `marketplace-chat`, route global `worker-chat-marketplace`, core `apps/worker-api/src/core/chat`, Shopee chat client và tài liệu AI policy.
- Luồng gửi cũ `POST /api/chat/send` chỉ lưu message sau khi gọi adapter gửi thành công hoặc fallback local, frontend sau đó reload hội thoại. Vì vậy tin shop không được append ngay khi CSKH bấm gửi.
- Một số file chat cũ có từ khóa nhạy cảm về token/session/authorization. Không in giá trị ra log; chỉ audit theo tên file và loại rủi ro.
- `apps/chat-worker-api` chưa tồn tại trước refactor này, nên phase đầu tạo service mới song song thay vì sửa sâu Worker chính.

## File cũ và hướng xử lý

| File cũ | Chức năng hiện tại | Trạng thái | Module mới tương ứng |
|---|---|---|---|
| `apps/fe/pages/chat-marketplace.html` | Trang chat sàn cũ, load split module legacy | legacy/fallback | `apps/fe/pages/chat-cskh.html` |
| `apps/fe/pages/chat-zalo.html` | Trang chat Zalo riêng | migrate sau | `apps/fe/js/dashboard/chat/index.js`, `adapters/zalo.js` |
| `apps/fe/js/dashboard/chat-marketplace-page.js` | Shell trang chat sàn cũ | legacy/fallback | `apps/fe/js/dashboard/chat/index.js` |
| `apps/fe/js/dashboard/chat-zalo.js` | Logic chat Zalo cũ | migrate sau | `apps/fe/js/dashboard/chat/api.js`, `adapters/zalo.js` |
| `apps/fe/js/features/chat-zalo/chat-zalo-inline-1.js` | Mảnh UI/logic Zalo inline | migrate sau | `apps/fe/js/dashboard/chat/render.js`, `events.js` |
| `apps/fe/css/features/chat-zalo/chat-zalo-inline-1.css` | CSS Zalo inline | migrate sau | `apps/fe/css/dashboard/chat.css` |
| `apps/fe/js/dashboard/fe-chat-marketplace-loader.js` | Loader nối các module chat cũ | legacy/fallback | `apps/fe/js/dashboard/chat/index.js` |
| `apps/fe/js/dashboard/fe-chat-marketplace/fe-chat-foundation-state-utils.js` | State, helper, fetch cũ | migrate | `state.js`, `api.js` |
| `apps/fe/js/dashboard/fe-chat-marketplace/fe-chat-conversation-thread-render.js` | Render danh sách hội thoại và thread | migrate | `render.js` |
| `apps/fe/js/dashboard/fe-chat-marketplace/fe-chat-conversations-sync-actions.js` | Load/sync hội thoại, mở thread | migrate | `sync.js`, `state.js` |
| `apps/fe/js/dashboard/fe-chat-marketplace/fe-chat-context-media-guard-send.js` | Guard, media, gửi tin cũ | migrate | `events.js`, `media.js`, `api.js` |
| `apps/fe/js/dashboard/fe-chat-marketplace/fe-chat-message-media-fetch-automation-send.js` | Media, automation fallback | migrate sau | `media.js`, `attachment-core.js` |
| `apps/fe/js/dashboard/fe-chat-marketplace/fe-chat-settings-quick-replies.js` | Cài đặt trả lời nhanh | migrate | `settings.js`, `ai.js` |
| `apps/fe/js/dashboard/fe-chat-marketplace/fe-chat-ai-shop-controls.js` | Điều khiển AI theo shop | migrate | `settings.js`, `ai-policy-core.js` |
| `apps/fe/js/dashboard/fe-chat-marketplace/fe-chat-settings-api-knowledge-panels.js` | Panel knowledge/API | migrate sau | `ai.js`, `customer-core.js` |
| `apps/fe/js/dashboard/fe-chat-marketplace/fe-chat-product-advisory-editor.js` | Tư vấn sản phẩm | migrate sau | `order-link.js`, `ai-policy-core.js` |
| `apps/fe/js/dashboard/fe-chat-marketplace/fe-chat-product-catalog-modal.js` | Modal sản phẩm | migrate sau | `order-link.js` |
| `apps/fe/js/dashboard/fe-chat-marketplace/fe-chat-order-product-actions.js` | Action đơn/sản phẩm trong chat | migrate sau | `order-link.js` |
| `apps/fe/js/dashboard/fe-chat-marketplace/fe-chat-order-product-context-panels.js` | Panel đơn/sản phẩm | migrate sau | `order-link.js` |
| `apps/fe/js/dashboard/fe-chat-marketplace/fe-chat-knowledge-order-sync-base.js` | Knowledge và đồng bộ đơn | migrate sau | `order-link.js`, `ai.js` |
| `apps/fe/js/dashboard/fe-chat-marketplace/fe-chat-context-tab-product-advisory-status.js` | Tab trạng thái tư vấn | migrate sau | `order-link.js` |
| `apps/fe/js/dashboard/fe-chat-marketplace/fe-chat-filters-automation-settings.js` | Bộ lọc và modal automation | migrate | `render.js`, `settings.js` |
| `apps/fe/js/dashboard/fe-chat-marketplace/fe-chat-shop-capability-settings.js` | Trạng thái shop/API | migrate | `settings.js`, route `settings.js` |
| `apps/fe/js/dashboard/fe-chat-marketplace/fe-chat-notification-settings-data.js` | Notification/web push | legacy tới phase riêng | route `settings.js` |
| `apps/fe/js/dashboard/fe-chat-marketplace/fe-chat-realtime-bootstrap.js` | Poll/realtime cũ | migrate | `sync.js` |
| `apps/fe/js/dashboard/fe-chat-marketplace/fe-chat-voucher-rule-setup-panels.js` | Rule/voucher | migrate sau | `ai-policy-core.js` |
| `apps/worker-api/src/routes/marketplace-chat/index.js` | Wrapper export global route chat cũ | legacy/fallback | `apps/chat-worker-api/src/index.js` |
| `apps/worker-api/src/routes/worker-chat-marketplace/worker-chat-index.js` | Loader backend chat cũ | legacy/fallback | route modules mới |
| `apps/worker-api/src/routes/worker-chat-marketplace/worker-chat-notifications-router.js` | Router `/api/chat/*` cũ | migrate | `routes/conversations.js`, `messages.js`, `send.js`, `sync.js`, `ai.js`, `settings.js` |
| `apps/worker-api/src/routes/worker-chat-marketplace/worker-chat-tables-settings.js` | D1 schema/settings cũ | migrate | `conversation-core.js`, `settings.js` |
| `apps/worker-api/src/routes/worker-chat-marketplace/worker-chat-identity-save-message.js` | Lưu conversation/message cũ | migrate | `message-merge.js`, `conversation-core.js` |
| `apps/worker-api/src/routes/worker-chat-marketplace/worker-chat-identity-api-conversation.js` | Chuẩn hóa identity/API conversation | migrate | `identity-core.js`, `conversation-core.js` |
| `apps/worker-api/src/routes/worker-chat-marketplace/worker-chat-message-automation-normalize.js` | Normalize tin automation | migrate | `message-normalize.js` |
| `apps/worker-api/src/routes/worker-chat-marketplace/worker-chat-shopee-timestamp.js` | Normalize timestamp SellerChat seconds/milliseconds/microseconds/nanoseconds/ISO string | active readback | `sync-core.js`, `adapters/shopee.js` |
| `apps/worker-api/src/routes/worker-chat-marketplace/worker-chat-message-media-normalize.js` | Normalize media | migrate | `attachment-core.js` |
| `apps/worker-api/src/routes/worker-chat-marketplace/worker-chat-send-reply-dispatch.js` | Gửi tin qua API/fallback, lưu sau khi gửi | migrate | `send-core.js`, `adapters/shopee.js`, `adapters/lazada.js` |
| `apps/worker-api/src/routes/worker-chat-marketplace/worker-chat-send-parse-media-store.js` | Parse/upload media | migrate | `attachment-core.js`, `routes/attachments.js` |
| `apps/worker-api/src/routes/worker-chat-marketplace/worker-chat-shopee-api-client.js` | Client Shopee chat cũ | migrate | `adapters/shopee.js` |
| `apps/worker-api/src/routes/worker-chat-marketplace/worker-chat-shopee-send-official.js` | Gửi Shopee chính thức | migrate | `adapters/shopee.js` |
| `apps/worker-api/src/routes/worker-chat-marketplace/worker-chat-shopee-bridge.js` | Bridge nội bộ từ Chat Worker mới sang helper SellerChat cũ | active bridge | `adapters/shopee.js` |
| `apps/worker-api/src/routes/worker-chat-marketplace/worker-chat-shopee-sync-canonical.js` | Sync Shopee canonical, hiện phục vụ bridge polling/readback | bridge dependency | `sync-core.js`, `adapters/shopee.js` |
| `apps/worker-api/src/features/shopee/api/chatClient.js` | Client Shopee `chat_client` dùng endpoint chính thức | migrate/giữ tham khảo | `adapters/shopee.js` |
| `apps/worker-api/src/routes/worker-chat-marketplace/worker-chat-lazada-im-sync-send.js` | Lazada IM sync/send | skeleton trước | `adapters/lazada.js` |
| `apps/worker-api/src/routes/worker-chat-marketplace/worker-chat-lazada-automation-api.js` | Lazada automation fallback | legacy/fallback | `adapters/lazada.js` |
| `apps/worker-api/src/routes/worker-chat-marketplace/worker-chat-ai-draft.js` | AI draft cũ | migrate | `ai-policy-core.js`, `routes/ai.js` |
| `apps/worker-api/src/routes/worker-chat-marketplace/worker-chat-ai-auto-reply.js` | Auto reply cũ | legacy khóa live | `ai-policy-core.js` chỉ gợi ý |
| `apps/worker-api/src/core/chat/ai-support-policy-core.js` | Rule chính sách AI | migrate/giữ tham khảo | `ai-policy-core.js` |
| `docs/ai-support-policy.md` | Chính sách AI support | giữ | `docs/chat-core-schema.md`, `ai-policy-core.js` |
| `docs/ai-support-policy-rules.json` | Rule AI dạng JSON | giữ | `ai-policy-core.js` |
| `scripts/check-tiktok-chat-dedupe-cdp.mjs` | Test dedupe TikTok cũ | migrate sau | test sync/dedupe mới |
| `scripts/check-order-chat-resolver-cdp.mjs` | Test link OMS -> chat cũ | giữ để chống regress OMS | `order-link.js` |

## File có rủi ro secret/session theo tên file

Không in giá trị ra log. Các file dưới đây chỉ được đánh dấu vì có từ khóa token/session/authorization trong code hoặc tên biến:

- `apps/worker-api/src/routes/worker-chat-marketplace/worker-chat-shopee-api-client.js`: token/API auth.
- `apps/worker-api/src/routes/worker-chat-marketplace/worker-chat-shopee-send-official.js`: token/API auth.
- `apps/worker-api/src/routes/worker-chat-marketplace/worker-chat-lazada-im-sync-send.js`: token/API auth.
- `apps/worker-api/src/routes/worker-chat-marketplace/worker-chat-lazada-automation-api.js`: token/session/API auth.
- `apps/worker-api/src/routes/worker-chat-marketplace/worker-chat-send-reply-dispatch.js`: authorization và platform response.
- `apps/worker-api/src/routes/worker-chat-marketplace/worker-chat-api-sync-webpush.js`: push subscription/session.
- `apps/worker-api/src/features/shopee/api/chatClient.js`: Shopee chat auth qua `chat_client`.
- `apps/worker-api/src/core/chat/transport-core.js`: transport/token state.
- `apps/worker-api/src/core/chat/identity-core.js`: identity/session-adjacent keys.

## Module mới tạo ở phase 1-5

| Module mới | Vai trò |
|---|---|
| `apps/chat-worker-api/src/core/message-normalize.js` | Chuẩn hóa message từ mọi kênh về schema chung |
| `apps/chat-worker-api/src/core/capability-core.js` | Chuẩn hóa capability shop/kênh: API, bridge, browser helper, gửi tay, chưa cấu hình |
| `apps/chat-worker-api/src/core/message-merge.js` | Chống trùng theo `platform_message_id` rồi `client_temp_id` |
| `apps/chat-worker-api/src/core/conversation-core.js` | D1/memory store, conversation, message, settings |
| `apps/chat-worker-api/src/core/send-core.js` | Lưu outbound ngay, gọi adapter khi capability cho phép, cập nhật `sent/failed/manual_pending/queued_for_browser_helper` |
| `apps/chat-worker-api/src/core/sync-core.js` | Shopee inbox polling, sync state, merge inbound/outbound qua adapter khi có `webhook` hoặc `polling_api`, không fake success nếu chỉ browser/manual |
| `apps/chat-worker-api/src/core/ai-policy-core.js` | AI chỉ gợi ý; auto-send tương lai chỉ được xét khi `send_capability` là `official_api` hoặc `bridge` |
| `apps/chat-worker-api/src/core/attachment-core.js` | Metadata attachment/R2, không nhét file trực tiếp vào D1 |
| `apps/chat-worker-api/src/adapters/shopee.js` | Adapter Shopee, chỉ live khi có endpoint cấu hình rõ |
| `apps/chat-worker-api/src/adapters/lazada.js` | Skeleton trả `adapter_not_implemented` |
| `apps/chat-worker-api/src/adapters/tiktok.js` | Skeleton trả `adapter_not_implemented` |
| `apps/chat-worker-api/src/adapters/facebook.js` | Skeleton trả `adapter_not_implemented` |
| `apps/chat-worker-api/src/adapters/zalo.js` | Skeleton trả `adapter_not_implemented` |
| `apps/fe/js/dashboard/chat/*` | UI mới có optimistic send, merge bằng `client_temp_id`, badge capability theo shop/kênh |

## Điều kiện chuyển legacy sang xóa

Chỉ xóa từng phần legacy khi:

1. Route mới thay thế hoàn toàn route cũ cùng chức năng.
2. UI mới chạy ổn trên mobile/tablet/PC.
3. Gửi tin shop hiển thị ngay, sync không tạo duplicate.
4. `rg` không còn import hoặc gọi runtime tới file legacy đó.
5. Production đã deploy đúng profile `shophuyvan-chat-api` cho Worker, đúng static frontend cho UI, và kiểm thật bằng Chrome profile `E:\codex-chrome-profiles\shophuyvan-test`.

Trạng thái 2026-05-19: `chat-marketplace.html`, `fe-chat-marketplace/*`, `worker-chat-marketplace/*` và `core/chat/*` đã xóa; Worker chính `/api/chat/*` trả 410, Chat Worker riêng tiếp tục phục vụ `/api/chat/*` của hệ mới.

## Finance/Order Read Contract For Chat Cards 2026-05-19

- Chat order card không tự tính doanh thu, phí hoặc lãi; nếu cần hiển thị số đơn thì đọc Order/Finance Core đã chuẩn hóa.
- Finance taxonomy hiện tách `gross_revenue`, `buyer_total_paid`, Shopee Voucher, seller cofunded voucher, platform funded voucher, actual income, ADS, PiShip và cost setting.
- Không lấy `buyer_total_paid` làm `gross_revenue` khi có platform voucher; không trừ platform funded voucher hoặc shop discount vào lãi của shop.
- PiShip có thể đến từ Payment API (`shipping_seller_protection_fee_amount`) hoặc fallback Cost Setting; UI phải hiển thị nguồn thay vì tự đoán.

## Shopee Full Inbox Polling 2026-05-18

- Endpoint chính thức dùng cho polling: `GET /api/v2/sellerchat/get_conversation_list` và `GET /api/v2/sellerchat/get_message`.
- Endpoint tham chiếu conversation đơn: `GET /api/v2/sellerchat/get_one_conversation`.
- Timestamp chính thức đã verify runtime: `last_message_timestamp` là Unix nanoseconds; `created_timestamp` là Unix seconds.
- Worker chính normalize bằng `normalizeShopeeTimestamp()` để nhận seconds, milliseconds, microseconds, nanoseconds, numeric string hoặc ISO string; parse lỗi trả rỗng/null có kiểm soát, không throw `Invalid time value`.
- Chat Worker lưu state ở `chat_sync_state` và snapshot theo conversation: `last_synced_at`, `last_success_at`, `last_error_code`, `last_error_message`, `pulled_conversations`, `pulled_messages`, `saved_messages`, `skipped_duplicates`, `sync_cursor`, `last_message_timestamp`.
- Duplicate prevention: `platform_message_id` là khóa ưu tiên; nếu outbound đã `sent` được SellerChat readback lại thì merge vào row cũ, không insert thêm và không hạ status xuống `synced`.
- Production verify shop API `chihuy1984`: lượt 1 `pulled_conversations=20`, `pulled_messages=53`, `saved_messages=53`; lượt lặp `pulled_messages=0`, `saved_messages=0`. `platform_message_id=2414019124426817905` vẫn đúng `1` row, status `sent`.
- Shop chưa API `khogiadungcona`: `shop_chat_mode=manual`, `send_capability=manual_only`, `sync_capability=manual_import`, `error_code=shop_api_not_configured`; không gọi SellerChat API.
- Attachment bridge vẫn chưa bật live; request có attachment trả `attachment_bridge_not_ready`.
# Hotfix automation runner 2026-05-20

- Chat không điều khiển trực tiếp status/detail/label runner; chỉ đọc diagnostic đã đi qua Order Core/Admin.
- TikTok runner control nằm ở local helper `http://127.0.0.1:8765/tiktok-runner/status|pause|resume|stop`, dùng profile automation riêng `E:\shophuyvan-python-automation\profiles\browser\shophuyvan-runner-tiktok`, không dùng profile user `shophuyvan-test`.
- Khi Chat/OMS hiển thị trạng thái đơn TikTok/Shopee manual, nguồn phải là `Order Core`/Seller Center fallback, không gọi API giả và không gửi tin live.
- Label status trong Chat/OMS phải đọc `label_status`, `last_label_error`, `manual_required` từ Core; không gọi legacy `/api/labels/refresh/*` và không tự tạo job Chrome label cũ.
## OMS/Core Hotfix 2026-05-20

- Chat/CSKH must continue to read order status, label state, finance state and tracking state from Order/Warehouse Core. It must not create a second sync status model or trigger label/order runners directly.
- OMS `order_sync_completeness` is now the shared operator result: `Đã đồng bộ`, `Thiếu dữ liệu tài chính`, `Lỗi tải tem`, `Chờ ví TikTok`, `Cần đồng bộ Seller Center`, `Cần thao tác thủ công`.
- TikTok runner may be queued by Radar in small safe batches when user-enabled and unpaused, profile `E:\shophuyvan-python-automation\profiles\browser\shophuyvan-runner-tiktok`; user profile `E:\codex-chrome-profiles\shophuyvan-test` is UI verification only.
- Shopee API shops (`chihuy1984`, `chihuy2309`, `phambich2312`) and Lazada API shop (`kinhdoanhonlinegiasoc@gmail.com`) must not fall back to Seller Center. `khogiadungcona` is the Shopee Seller Center fallback shop; `0909128999` is TikTok fallback/manual.
- Tracking timeline for order cards should use Core data from `/api/logistics-watch/detail`, not raw browser helper data. Long technical errors stay in diagnostics, not row text.

## OMS order chat verification 2026-05-20

- OMS opens chat through the Core order chat-target route and Chat Worker bridge. Worker main legacy `/api/chat/context` and `/api/chat/conversations` stay `410`; OMS must not call legacy chat scans.
- Shopee live send from order passed for all API shops with text `ok`:
  - `chihuy1984`, order `260520VCWW63EE`, Chat Worker message `msg_c994adeb-d53e-4270-abec-a9700556d5a5`, Shopee message `2414388038268797297`.
  - `chihuy2309`, order `260520VDAFN735`, Chat Worker message `msg_11199a2e-e15c-47c4-a826-a0bc77e20ddd`, Shopee message `2414388042335093105`.
  - `phambich2312`, order `260520UVFANRBD`, Chat Worker message `msg_180031fe-ed44-4f96-8408-4525d4e14887`, Shopee message `2414388045514441075`.
- Lazada `kinhdoanhonlinegiasoc@gmail.com`, order `525472804102182`, failed safely with `missing_session_id` after read-only sync `/im/session/list` and `/im/message/list` returned no matching session. Do not mark Lazada order-chat send as pass until order/customer maps to an official `session_id`.
- TikTok `0909128999`, order `584104642942568017`, is classified `manual_send_required` / `manual_pending`. It is not live API send and must not show a fake success toast.
- Production browser with Chrome profile `E:\codex-chrome-profiles\shophuyvan-test` opened OMS order `260520VDAFN735`, clicked `Nhắn khách`, landed on `chat-cskh` with order context, and displayed sent `ok` as `Đã gửi`.
- TikTok runner note supersedes the previous one-shot-only wording: `codex_hotfix_final_pause` is legacy and now auto-cleared; Radar may queue small safe TikTok batches when unpaused, still using automation profile `E:\shophuyvan-python-automation\profiles\browser\shophuyvan-runner-tiktok`.

## OMS order chat stabilization follow-up 2026-05-20

- Lazada order chat now resolves from synced IM data in `marketplace_chat_conversations`, not from a blank/manual conversation fallback and not from a broad `orders_v2` scan.
- Lazada mapping fields returned by `/api/core/orders/:orderId/chat-target`: `order_id`, `shop_id=200166591213`, `shop_key=lazada:200166591213`, buyer/customer id, `session_id`, `conversation_id`, `source`, `confidence`, `missing_fields`.
- Production PASS: order `527394116390561`, session/conversation `200013190561_1_200166591213_2_103`, source `marketplace_chat_conversations:api:order_message_card`, confidence `order_session_confirmed`, sent text `ok`, Chat Worker message `msg_81ec3ec8-f027-46c9-85af-e6de46d3849e`, Lazada platform message `9fbd4NrxXBS0BPAmD68895`.
- Chat Worker Lazada send must reject missing official session/platform conversation id with `buyer_session_mapping_missing`; do not create another blank Lazada conversation as a fake success path.
- Shopee regression PASS from OMS/order context:
  - `chihuy1984` `260520VCWW63EE` -> Shopee message `2414401834649469297`.
  - `chihuy2309` `260520VDAFN735` -> Shopee message `2414401836182552946`.
  - `phambich2312` `260520UVFANRBD` -> Shopee message `2414401837572981105`.
- TikTok order `584104642942568017` remains not pass for live send: official Customer Service API family exists, but this project has no TikTok Chat adapter/token scope configured yet, so production must show `adapter_not_configured` / manual path and never toast `Đã gửi` as success.
- Worker main legacy routes `/api/chat/context` and `/api/chat/conversations` remain `410`.

## Cập nhật 2026-05-21 - Ranh giới chat với automation order

- Chat/CSKH chỉ đọc Order/Shop/Status/Finance/Label Core; không gọi trực tiếp Python automation hoặc Seller Center để vá màn hình chat.
- Khi Chat cần dữ liệu đơn/tracking/finance/label còn thiếu, dữ liệu phải được đưa vào Warehouse/Core trước qua action automation đúng (`sync_detail`, `sync_finance`, `refresh_status`, `retry_label`) hoặc API Open Platform của shop API.
- Không gửi tin live trong các lượt kiểm automation order/label nếu user không yêu cầu rõ.
