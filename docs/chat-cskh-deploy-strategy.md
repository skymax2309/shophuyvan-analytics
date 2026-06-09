# Chiến lược deploy Chat/CSKH

Ngày cập nhật: 2026-05-18

## Cập nhật cleanup Chat legacy 2026-05-19

Lượt 2026-05-19 đã xóa runtime Chat legacy thay vì tiếp tục giữ fallback: frontend `chat-marketplace.html`/`fe-chat-marketplace/*` đã xóa, Worker chính `/api/chat/*` trả 410 `legacy_chat_route_disabled`, backend `worker-chat-marketplace/*` và `core/chat/*` đã xóa. Chat mới vẫn là `chat-cskh.html` + `apps/chat-worker-api`; bridge Shopee còn giữ trong Worker chính là `routes/marketplace-chat/shopee-bridge.js`, không còn phụ thuộc router Chat legacy.

## Cập nhật Shop Core display name Shopee 2026-05-18

- Chat/CSKH không render `Shopee · <raw numeric shop_id>` làm tên shop chính nữa. List, header thread và panel khách dùng `conversation.shop_display_name`.
- Conversation API của Chat Worker enrich Shopee conversation từ Worker chính `/api/core/shops`; response trả thêm `shop_display_name`, `shop_name_source`, `shop_profile_source`, `shop_name_missing`.
- Nếu Shop Core chưa có tên chính thức, UI hiện `Shopee · Shop chưa đồng bộ tên` và badge `Thiếu tên shop`; badge API/Bridge/Polling API giữ nguyên.
- Sync tên shop dùng endpoint đọc chính thức `GET /api/v2/shop/get_shop_info` và `GET /api/v2/shop/get_profile`, route nội bộ vận hành là `GET /api/shops/shopee-profile-sync`.
- Không gửi tin live trong lượt kiểm này; chỉ đọc docs, gọi endpoint profile/snapshot và mở UI production.
- Deploy lượt này:
  - Worker chính `huyvan-worker-api` version `308d7646-7a70-416e-8b1d-c4c462cbae56`.
  - Chat Worker `shophuyvan-chat-api` version `71e0271c-690a-4c29-abea-d281ae929739`.
  - Static UI `shophuyvan-analytics` version `9b659fbe-160a-460a-aca0-729a30420db4`.
- Production verify bằng Chrome profile `E:\codex-chrome-profiles\shophuyvan-test`: desktop `1366x900`, tablet `820x1180`, mobile `390x844` đều không còn `Shopee · 170044686` hoặc `Shopee · 166563639`; vẫn thấy `API chính thức`, `Bridge`, `Polling API`, không tràn ngang.

## Cập nhật nối Order/Product Core 2026-05-18

- Dừng vá riêng panel đơn Chat; Chat UI mới đọc Order/Product Core từ Worker chính qua `window.SHOPHUYVAN_CORE_API_BASE`.
- Endpoint đọc chung mới: `GET /api/core/orders/by-conversation/:conversationId`, `GET /api/core/orders/:orderId`, `GET /api/core/products/by-sku/:sku`, `GET /api/core/shops`.
- Tab `Đơn` trong `chat-cskh.html` chỉ hiển thị dữ liệu thật trả từ `/api/core/*`; nếu thiếu mã đơn/buyer identity thì hiện trạng thái `need_order_or_buyer_identity` hoặc `no_order_match`, không tự xác nhận đơn/tồn/fee.
- Shop chưa API phải hiện `Shop chưa có API`, `Dữ liệu tham chiếu`, `Manual import` hoặc `Cost setting` theo Shop Core, không gắn nhãn API.
- Static UI cache version chuyển sang `chat-core-data-20260518a`; Worker chính cần deploy vì route `/api/core/*` nằm trong `apps/worker-api`.
- Deploy đã thực hiện:
  - Worker chính `huyvan-worker-api` version `c6fc36ec-52e1-4714-8474-f4167598020a`, account `efe50fab1dd644088d681fb14a4838ae`.
  - Static UI `shophuyvan-analytics` version `6fb0babd-e581-47dd-a6d4-2009c9a45fe3`.
- Production verify bằng Chrome profile `E:\codex-chrome-profiles\shophuyvan-test`: desktop `1366x900`, tablet `820x1180`, mobile `390x844` đều pass; tab `Đơn` đọc được Order/Product Core, không tràn ngang.

## Cập nhật UI theo Duoke 2026-05-18

- Đã mở Duoke bằng Chrome profile `E:\codex-chrome-profiles\shophuyvan-test` và tham khảo workflow vận hành: rail kênh, danh sách hội thoại có avatar/preview/unread, thread giữa màn, composer dưới cùng, panel khách/đơn/trạng thái bên phải.
- UI ShopHuyVan giữ khác Duoke ở phạm vi nghiệp vụ: chỉ bật Shopee trong lượt này, không thêm logic Lazada/TikTok/Facebook/Zalo/AI; shop chưa API hiển thị manual/import rõ và composer không gửi lên sàn.
- Static UI production deploy từ `apps/fe` lên `shophuyvan-analytics.nghiemchihuy.workers.dev`, version mới nhất `7c25b8d8-8c92-4ed3-885e-824631500c8f`; không deploy Worker chính hoặc Chat Worker trong lượt UI này.
- Asset cache version UI hiện tại: `chat-duoke-20260518a`.
- UI gọi `POST /api/chat/sync` với `shop_id` của shop Shopee có `sync_capability=polling_api`; nếu đang chọn shop manual thì UI tự chọn shop API đầu tiên trong inbox, không gọi SellerChat API cho shop manual.
- Kiểm production bằng Chrome profile `E:\codex-chrome-profiles\shophuyvan-test`:
  - Desktop `1366x768`: pass, có 3 vùng danh sách/thread/panel phải, không tràn ngang.
  - Tablet `768x1024`: pass, list + thread 2 cột, panel khách/trạng thái nằm dưới thread, không tràn ngang.
  - Mobile `390x844`: pass, vào list trước, bấm hội thoại vào thread, có nút `Quay lại`, composer dễ bấm, không tràn ngang.
- Sync Shopee shop API `chihuy1984` sau UI: pass `pulled_conversations=20`, `pulled_messages=0`, `saved_messages=0`, `skipped_duplicates=0`.
- Thread `conv_33eb86de-a954-42ae-b993-737b7dcab632` vẫn đúng `1` message theo `platform_message_id=2414019124426817905`, status `sent`.
- Shop chưa API `khogiadungcona` hiển thị `Chưa có API`, `Gửi tay`, `Manual import`; composer bị khóa và không fake gửi thành công.
- Attachment vẫn chưa bật live; UI hiển thị `Attachment chưa bật` và nút `Tệp` trả trạng thái `attachment_bridge_not_ready`.
- Legacy cleanup 2026-05-19 đã xóa `chat-marketplace.html` và nhóm `fe-chat-marketplace`; Worker chính `/api/chat/*` cũ trả 410, Chat Worker riêng tiếp tục phục vụ hệ mới.

## Quyết định hiện tại

Giai đoạn sau Phase 1-5 giữ Chat/CSKH trong mono-repo `shophuyvan-analytics`, nhưng deploy bằng Cloudflare riêng cho Chat.

- Code Worker: `apps/chat-worker-api`.
- UI mới: `apps/fe/pages/chat-cskh.html`, `apps/fe/js/dashboard/chat`, `apps/fe/css/dashboard/chat.css`.
- GitHub repo được phép hiện tại: `skymax2309/shophuyvan-analytics`.
- Cloudflare profile bắt buộc: `shophuyvan-chat-api`.
- Worker: `shophuyvan-chat-api`.
- D1: `shophuyvan-chat-db`.
- R2: `shophuyvan-chat-files`.
- GitHub repo riêng `zacha030596-dev/shophuyvan-chat` là hướng tương lai, không chặn deploy mono-repo hiện tại.

## Luật chọn profile

Chọn Cloudflare profile `shophuyvan-chat-api` khi path hoặc thay đổi nằm trong:

- `apps/chat-worker-api`
- `apps/fe/js/dashboard/chat`
- `apps/fe/css/dashboard/chat.css`
- `apps/fe/pages/chat-cskh.html`
- route `/api/chat/*` của Worker Chat riêng

Không deploy Worker chính `DuAn_shophuyvan-analytics` nếu chỉ thay Chat/CSKH. Không deploy OMS, Finance, Product Master, ADS, Report hoặc Video trong cùng lệnh deploy Chat.

## Gate bắt buộc trước production

1. Repo/path đang là mono-repo `shophuyvan-analytics`.
2. `profiles.local.json` có profile `shophuyvan-chat-api`.
3. `CLOUDFLARE_ACCOUNT_ID` trong process là `39cf0fe9b3eda88bda53e369770cabeb`.
4. `npx wrangler whoami` pass với token profile Chat.
5. `wrangler.toml` trỏ Worker `shophuyvan-chat-api`, D1 `shophuyvan-chat-db`, R2 `shophuyvan-chat-files`.
6. `npm test --prefix apps/chat-worker-api` pass.
7. `node --check` pass cho toàn bộ JS mới trong `apps/chat-worker-api` và `apps/fe/js/dashboard/chat`.
8. Quét mojibake/token không có hit thật trong `AGENTS.md`, `README.md`, `docs`, `apps`.

## Production verify sau deploy

- `GET /api/chat/health` trả `ok: true`.
- `GET /api/chat/conversations` trả response thật từ Worker Chat riêng.
- Conversation phải có capability rõ: `shop_chat_mode`, `send_capability`, `sync_capability`.
- UI phải hiện badge theo capability: `API chính thức`, `Bridge`, `Browser helper`, `Gửi tay`, `Chưa cấu hình`.
- UI production mở bằng Chrome profile `E:\codex-chrome-profiles\shophuyvan-test`.
- Kiểm mobile, tablet, PC.
- Gửi safe message: message shop hiện ngay `sending`; nếu Shopee bridge chưa cấu hình thì chuyển `failed` với `adapter_not_configured` và có nút gửi lại.
- Shop không API không được fake success; nếu chưa gửi lên sàn thì status phải là `failed`, `manual_pending` hoặc `queued_for_browser_helper`.
- Sync không tạo duplicate theo `platform_message_id` hoặc `client_temp_id`.
- Shopee shop có API sync bằng inbox polling: `get_conversation_list` -> chỉ gọi `get_message` cho conversation mới/changed -> merge vào D1 Chat Worker. Sync lặp lại không được insert thêm nếu không có tin mới.

## Capability shop có API và không API

Một Chat Core chung xử lý cả shop có API và shop không API. Khác biệt nằm ở adapter/capability theo `channel + shop_id`, không nằm ở hệ thống chat riêng.

| Nhóm shop | Capability đúng | Quy tắc |
|---|---|---|
| Shop có API chính thức | `shop_chat_mode=api`, `send_capability=official_api`, `sync_capability=webhook` hoặc `polling_api` | Ưu tiên API/webhook, không dùng browser helper nếu quyền API đã đủ |
| Shop dùng cầu nối an toàn | `shop_chat_mode=api`, `send_capability=bridge`, `sync_capability=polling_api` | Chỉ coi gửi thành công khi bridge trả success thật |
| Shop không API có helper | `shop_chat_mode=browser_helper`, `send_capability=none`, `sync_capability=browser_helper` | Tin gửi chuyển `queued_for_browser_helper`, chưa ghi `sent` |
| Shop gửi tay | `shop_chat_mode=manual`, `send_capability=manual_only`, `sync_capability=manual_import` | Tin gửi chuyển `manual_pending`, nhân viên tự gửi trên sàn |
| Chưa cấu hình | `shop_chat_mode=disabled`, `send_capability=none`, `sync_capability=none` | Tin gửi chuyển `failed` với `adapter_not_configured` |

AI CSKH chỉ ở `suggest_only` cho đến khi shop có `send_capability=official_api` hoặc `bridge` và rule an toàn đã bật.

## Kết quả deploy Worker 2026-05-18

- Cloudflare profile: `shophuyvan-chat-api`.
- Cloudflare account id: `39cf0fe9b3eda88bda53e369770cabeb`.
- Worker production: `https://shophuyvan-chat-api.zacha030596.workers.dev`.
- Version ID mới nhất: `8c89a438-2875-4f68-97ed-cbf3404a0165`.
- Binding dry-run/deploy chỉ gồm D1 `shophuyvan-chat-db`, R2 `shophuyvan-chat-files`, và biến môi trường Chat; không có binding Worker chính.
- `GET /api/chat/health`: pass, mode `d1`.
- `GET /api/chat/conversations`: pass, trả danh sách thật từ D1.
- Safe send Shopee khi chưa có `SHOPEE_CHAT_BRIDGE_URL`: message lưu `sending`, kết quả cuối `failed`, `error_code=adapter_not_configured`.
- Sync Shopee khi chưa có bridge: trả HTTP `501` với `adapter_not_configured`, không tạo duplicate trong conversation test.
- Lượt deploy capability 2026-05-18 đã kiểm đủ mode production:
  - `official_api` thiếu bridge: `failed`, `adapter_not_configured`.
  - `bridge` thiếu cấu hình: `failed`, `adapter_not_configured`.
  - `manual`: `manual_pending`, `manual_send_required`.
  - `browser_helper`: `queued_for_browser_helper`, `browser_helper_required`.
  - `disabled`: `failed`, `adapter_not_configured`.

## Kết quả deploy UI 2026-05-18

- Frontend/static deploy từ `apps/fe` bằng profile `DuAn_shophuyvan-analytics`, account `efe50fab1dd644088d681fb14a4838ae`.
- Không chạy deploy trong `apps/worker-api`, không deploy Worker API chính.
- Static version ID mới nhất: `1d776058-82ed-4d25-ab55-17ddc9fe8d41`.
- UI production: `https://shophuyvan-analytics.nghiemchihuy.workers.dev/pages/chat-cskh.html`.
- `chat-cskh.html` mặc định dùng `window.SHOPHUYVAN_CHAT_API_BASE = "https://shophuyvan-chat-api.zacha030596.workers.dev"`; localhost mới override về cùng origin; asset cache version hiện tại `chat-core-20260518c`.
- Kiểm bằng Chrome profile `E:\codex-chrome-profiles\shophuyvan-test` qua CDP port `9333`.
- Mobile `390x844`: pass, API base đúng, đủ badge `API chính thức`, `Bridge`, `Browser helper`, `Gửi tay`, `Chưa cấu hình`; mở thread được, gửi safe message hiện `sending`, sau đó `failed`, có `Gửi lại`, sync không tăng số message, không tràn ngang.
- Tablet `820x1180`: pass cùng các tiêu chí trên, không tràn ngang.
- Desktop `1366x900`: pass cùng các tiêu chí trên, không tràn ngang.
- Sau kiểm đã dọn test data prefix `codex_cap_`; production D1 còn `0` conversation và `0` message test theo prefix này.
- Shopee bridge đã nối text live qua Worker chính vì helper và token shop Shopee đang nằm ở legacy Worker:
  - Bridge endpoint: `POST https://huyvan-worker-api.nghiemchihuy.workers.dev/api/internal/chat-bridge/shopee/messages/send`.
  - Auth nội bộ: header `X-Chat-Bridge-Secret`; Worker chính dùng secret `CHAT_BRIDGE_INTERNAL_SECRET`, Chat Worker dùng secret `SHOPEE_CHAT_BRIDGE_SECRET`.
  - Chat Worker var công khai: `SHOPEE_CHAT_BRIDGE_URL=https://huyvan-worker-api.nghiemchihuy.workers.dev/api/internal/chat-bridge/shopee`.
  - Worker chính deploy version mới nhất `233760a9-2469-4792-8b0d-284457d8f81c`; chỉ deploy để mở bridge/readback/polling Shopee, không đổi OMS/Finance/Product.
  - Live send qua Chat Worker mới pass: Shopee trả `platform_message_id=2414019124426817905`, message chuyển `sending` -> `sent`.
  - Readback qua route sync legacy đã pass: `/api/chat/api-sync` gọi `GET /api/v2/sellerchat/get_conversation_list` rồi `GET /api/v2/sellerchat/get_message`, kéo lại `platform_message_id=2414019124426817905` từ SellerChat và không tạo duplicate.
  - Timestamp Shopee đã xác nhận: conversation list trả `last_message_timestamp` dạng Unix nanoseconds; message history trả `created_timestamp` dạng Unix seconds. Worker chính normalize bằng `normalizeShopeeTimestamp()` để nhận seconds/milliseconds/microseconds/nanoseconds/ISO string và không throw `Invalid time value`.
  - Chat Worker deploy version mới nhất `15b7d0bb-5d48-4897-9dea-ec35a69a556b`; dedupe readback theo `platform_message_id` qua alias shop name/api shop id, nên message cũ vẫn giữ status `sent`.
  - Full inbox polling mới dùng bridge `POST /api/internal/chat-bridge/shopee/sync`: Worker chính gọi `GET /api/v2/sellerchat/get_conversation_list`, so `last_message_timestamp`, rồi gọi `GET /api/v2/sellerchat/get_message` cho conversation mới hoặc changed. Chat Worker lưu sync state gồm `last_synced_at`, `last_success_at`, `last_error_code`, `last_error_message`, `pulled_conversations`, `pulled_messages`, `saved_messages`, `skipped_duplicates`, `sync_cursor`.
  - Production verify full inbox shop API `chihuy1984`: lượt 1 kéo `20` conversation, `53` message và lưu `53`; lượt lặp kéo `20` conversation nhưng `0` message mới, `saved_messages=0`; `platform_message_id=2414019124426817905` vẫn đúng `1` row, status `sent`.
  - Shop Shopee chưa có API không gọi SellerChat API; capability đúng là `shop_chat_mode=manual` hoặc `browser_helper`, `send_capability=manual_only` hoặc `none`, `sync_capability=manual_import`, `browser_helper` hoặc `none`.
  - Bridge hiện bật text live; attachment trả `attachment_bridge_not_ready` để không fake success.

## Trạng thái kênh

| Kênh | Trạng thái hiện tại | Điều kiện gửi live |
|---|---|---|
| Shopee | Text live qua `bridge`; sync readback pass bằng SellerChat API | Readback dùng `get_conversation_list` + `get_message`; attachment chưa bật live và vẫn trả `attachment_bridge_not_ready` |
| Lazada | Skeleton `adapter_not_implemented` | Cần adapter IM/API chính thức hoặc fallback được chốt |
| TikTok | Skeleton `adapter_not_implemented` | Cần adapter/API chính thức hoặc helper được chốt |
| Facebook | Skeleton `adapter_not_implemented` | Cần adapter Meta/CRM riêng |
| Zalo | Skeleton `adapter_not_implemented` | Cần adapter Zalo/local tool riêng |
