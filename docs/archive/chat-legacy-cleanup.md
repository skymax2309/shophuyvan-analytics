# Kế hoạch cleanup legacy Chat/CSKH

Ngày lập: 2026-05-18

## Cập nhật chốt cleanup 2026-05-19

Quyết định vận hành mới đã thay đổi trạng thái: Chat legacy không còn được giữ chỉ vì còn caller. Lượt cleanup 2026-05-19 đã xóa `chat-marketplace.html`, `fe-chat-marketplace-loader.js`, toàn bộ `fe-chat-marketplace/*`, `routes/worker-chat-marketplace/*`, `core/chat/*` và các script CDP chỉ phục vụ trang legacy. `/api/chat/*` trên Worker chính trả `410 legacy_chat_route_disabled`; route Lazada Chat auth/disconnect cũ trả 410 riêng; bridge giữ lại nằm trong `routes/marketplace-chat/shopee-bridge.js` và thuộc Chat mới. Các mục dưới đây là lịch sử trước khi cleanup này được thực hiện.

## Nguyên tắc

Không xóa trắng hệ thống chat cũ. Mọi file legacy chỉ được dọn khi route mới, UI mới, gửi tin, sync, mobile/tablet/PC và production verification đều pass.

Chat/CSKH hiện vẫn nằm trong mono-repo `shophuyvan-analytics`; repo riêng cho chat là hướng tương lai. Deploy production phase hiện tại chỉ tách Cloudflare Worker/D1/R2 bằng profile `shophuyvan-chat-api`, không coi remote repo riêng là blocker.

UI mới đã được expose ở `https://shophuyvan-analytics.nghiemchihuy.workers.dev/pages/chat-cskh.html` và gọi Chat Worker riêng `https://shophuyvan-chat-api.zacha030596.workers.dev`. Vẫn giữ legacy cho tới khi đủ parity nghiệp vụ.

## Cập nhật cleanup sau UI Duoke 2026-05-18

- UI mới `chat-cskh.html` đã được deploy lại và kiểm production desktop/tablet/mobile. Lượt này không xóa file legacy vì chưa có parity đầy đủ cho đơn hàng/sản phẩm/media/notification.
- File đã thay UI mới nhưng vẫn giữ legacy:
  - `apps/fe/pages/chat-marketplace.html`
  - `apps/fe/js/dashboard/fe-chat-marketplace-loader.js`
  - `apps/fe/js/dashboard/fe-chat-marketplace/*.js`
  - `apps/worker-api/src/routes/worker-chat-marketplace/*.js`
- File đề xuất xóa ở lượt sau, sau khi có parity và test pass:
  - `apps/fe/pages/chat-marketplace.html`
  - `apps/fe/js/dashboard/fe-chat-marketplace/fe-chat-conversation-thread-render.js`
  - `apps/fe/js/dashboard/fe-chat-marketplace/fe-chat-conversations-sync-actions.js`
  - `apps/fe/js/dashboard/fe-chat-marketplace/fe-chat-context-media-guard-send.js`
- Không xóa `worker-chat-shopee-send-official.js`, `worker-chat-shopee-sync-canonical.js`, `worker-chat-shopee-bridge.js`, `worker-chat-shopee-api-client.js` vì Shopee bridge/readback production vẫn phụ thuộc.
- Attachment bridge vẫn chưa bật live; mọi cleanup liên quan media phải giữ guard `attachment_bridge_not_ready`.

## Legacy còn đang được gọi

| Nhóm file | Còn được gọi từ đâu | Điều kiện giữ |
|---|---|---|
| `apps/fe/pages/chat-marketplace.html` | Sidebar/dashboard hiện tại | Giữ đến khi `chat-cskh.html` được deploy production và user chốt thay trang chính |
| `apps/fe/js/dashboard/fe-chat-marketplace-loader.js` | `chat-marketplace.html` | Giữ để không mất luồng CSKH hiện tại |
| `apps/fe/js/dashboard/fe-chat-marketplace/*.js` | Loader legacy | Giữ đến khi UI mới đủ parity các tab hội thoại, đơn hàng, sản phẩm, AI, media |
| `apps/worker-api/src/routes/marketplace-chat/index.js` | Worker chính `apps/worker-api/src/index.js` | Giữ để OMS/dashboard hiện tại không mất `/api/chat/*` |
| `apps/worker-api/src/routes/worker-chat-marketplace/*.js` | Wrapper route legacy | Giữ đến khi chat worker riêng thay production endpoint |
| `apps/worker-api/src/core/chat/*.js` | Worker chính và script kiểm cũ | Giữ đến khi core mới có test tương đương |
| `scripts/check-order-chat-resolver-cdp.mjs` | Kiểm OMS mở chat | Giữ để chống regression link OMS -> chat |
| `scripts/check-tiktok-chat-dedupe-cdp.mjs` | Kiểm dedupe TikTok cũ | Giữ đến khi sync-core mới có test TikTok |

## Phân loại audit Shopee Chat/CSKH 2026-05-18

Chỉ phân loại trong phạm vi Shopee Chat/CSKH. Chưa xóa destructive vì bridge/readback production vẫn cần một phần helper legacy ở Worker chính.

### A. Đang còn dùng

| File/nhóm file | Lý do còn dùng |
|---|---|
| `apps/chat-worker-api/src/core/message-normalize.js` | Chuẩn hóa message/conversation mới và sync state. |
| `apps/chat-worker-api/src/core/conversation-core.js` | D1 Chat Worker cho conversation/message/sync state. |
| `apps/chat-worker-api/src/core/message-merge.js` | Chống trùng theo `platform_message_id`, giữ outbound đã `sent`. |
| `apps/chat-worker-api/src/core/sync-core.js` | Điều phối Shopee polling inbox qua adapter bridge. |
| `apps/chat-worker-api/src/adapters/shopee.js` | Adapter Shopee gọi bridge Worker chính. |
| `apps/chat-worker-api/src/routes/sync.js` | Route `POST /api/chat/sync` của Chat Worker. |
| `apps/worker-api/src/routes/worker-chat-marketplace/worker-chat-shopee-bridge.js` | Bridge nội bộ Shopee, gồm gửi text và polling sync. |
| `apps/worker-api/src/routes/worker-chat-marketplace/worker-chat-shopee-timestamp.js` | Normalize timestamp SellerChat an toàn. |

### B. Legacy nhưng bridge/readback Shopee còn phụ thuộc

| File | Phụ thuộc hiện tại |
|---|---|
| `apps/worker-api/src/routes/worker-chat-marketplace/worker-chat-shopee-sync-canonical.js` | Bridge sync gọi `syncShopeeChatShop()` để chạy `get_conversation_list` và `get_message`. |
| `apps/worker-api/src/routes/worker-chat-marketplace/worker-chat-shopee-send-official.js` | Bridge gửi text live gọi `sendShopeeChatOfficial()`. |
| `apps/worker-api/src/routes/worker-chat-marketplace/worker-chat-shopee-api-client.js` | Ký request và chọn token shop Shopee cho SellerChat. |
| `apps/worker-api/src/routes/worker-chat-marketplace/worker-chat-identity-api-conversation.js` | Normalize conversation/message từ SellerChat API. |
| `apps/worker-api/src/routes/worker-chat-marketplace/worker-chat-identity-save-message.js` | Lưu readback vào bảng legacy Worker chính trước khi trả về Chat Worker. |
| `apps/worker-api/src/routes/worker-chat-marketplace/worker-chat-message-automation-normalize.js` | Helper timestamp/media cũ vẫn được normalize Shopee dùng gián tiếp. |
| `apps/worker-api/src/routes/worker-chat-marketplace/worker-chat-api-sync-webpush.js` | Route `/api/chat/api-sync` legacy còn dùng để kiểm hẹp/readback cũ. |
| `apps/worker-api/src/routes/worker-chat-marketplace/worker-chat-notifications-router.js` | Router legacy vẫn expose bridge nội bộ và `/api/chat/api-sync`. |
| `apps/worker-api/src/routes/worker-chat-marketplace/worker-chat-context-messages-panel.js` | Legacy list message còn giữ cho fallback đọc thread cũ. |
| `apps/worker-api/src/routes/worker-chat-marketplace/worker-chat-webhook-record-list.js` | Webhook/readback legacy còn dùng chung normalize/lưu message. |

Các file trên đã được gắn comment `Deprecated` hoặc là bridge active. Không thêm logic mới vào file deprecated nếu không phục vụ bridge/readback Shopee.

### C. Đã có module thay thế nhưng chưa xóa

| Legacy | Module thay thế |
|---|---|
| `apps/fe/pages/chat-marketplace.html` | `apps/fe/pages/chat-cskh.html` sau khi UI mới đủ parity. |
| `apps/fe/js/dashboard/fe-chat-marketplace-loader.js` | `apps/fe/js/dashboard/chat/index.js`. |
| `apps/fe/js/dashboard/fe-chat-marketplace/fe-chat-conversation-thread-render.js` | `apps/fe/js/dashboard/chat/render.js`. |
| `apps/fe/js/dashboard/fe-chat-marketplace/fe-chat-conversations-sync-actions.js` | `apps/fe/js/dashboard/chat/sync.js` và `POST /api/chat/sync`. |
| `apps/fe/js/dashboard/fe-chat-marketplace/fe-chat-context-media-guard-send.js` | `apps/fe/js/dashboard/chat/events.js`, `media.js`, `api.js`. |
| `apps/worker-api/src/routes/marketplace-chat/index.js` | `apps/chat-worker-api/src/index.js` khi route Chat mới thay thế hoàn toàn. |
| `apps/worker-api/src/routes/worker-chat-marketplace/worker-chat-send-reply-dispatch.js` | `apps/chat-worker-api/src/core/send-core.js` và `routes/send.js` cho Chat Worker mới. |

### D. Rác/test/mock/fake-success cần xử lý ở lượt sau

Chưa xóa trong lượt này. Các candidate chỉ được xử lý sau khi đã có mapping thay thế và test production pass:

- Script kiểm tạm theo prefix `check-chat-core-*` chỉ giữ nếu còn phục vụ regression Chat Worker mới.
- Các seed/test data cũ trong D1 phải xóa theo prefix rõ, không xóa bằng wildcard rộng.
- Route hoặc script nào tạo `manual_pending`, `queued_for_browser_helper`, mock send hay fake success phải được rà riêng trước khi xóa; lượt này không phát hiện fake success mới trong Shopee bridge vì attachment vẫn trả `attachment_bridge_not_ready` và API lỗi được trả thật.

## File đã có module thay thế phase 1-5

| Legacy | Thay bằng |
|---|---|
| `worker-chat-send-reply-dispatch.js` | `apps/chat-worker-api/src/core/send-core.js`, `routes/send.js` |
| `worker-chat-message-automation-normalize.js` | `apps/chat-worker-api/src/core/message-normalize.js` |
| `worker-chat-identity-save-message.js` | `apps/chat-worker-api/src/core/message-merge.js`, `conversation-core.js` |
| `worker-chat-notifications-router.js` route tối thiểu | `apps/chat-worker-api/src/routes/*.js` |
| `fe-chat-context-media-guard-send.js` phần send | `apps/fe/js/dashboard/chat/events.js` |
| `fe-chat-conversation-thread-render.js` | `apps/fe/js/dashboard/chat/render.js` |
| `fe-chat-conversations-sync-actions.js` | `apps/fe/js/dashboard/chat/sync.js` |

## Chờ xóa sau

Không xóa trong phase này. Danh sách chờ xóa chỉ được chuyển thành PR cleanup khi:

1. `rg "fe-chat-marketplace|worker-chat-marketplace|marketplace-chat"` không còn hit runtime trong trang mới và worker chat mới.
2. Route mới thay thế đủ:
   - `GET /api/chat/conversations`
   - `GET /api/chat/conversations/:id/messages`
   - `POST /api/chat/messages/send`
   - `POST /api/chat/sync`
   - `POST /api/chat/ai/suggest`
   - `GET/POST /api/chat/settings`
3. Gửi Shopee có phản hồi thật từ endpoint chính thức hoặc bị chặn rõ bởi quyền/API, không có fake success.
4. Sync inbound và outbound không tạo trùng message.
5. Mobile/tablet/PC pass trên production.
6. OMS/dashboard cũ mở được bình thường sau deploy.

## Test bắt buộc trước khi cleanup

- `node --check` toàn bộ JS chat mới và file legacy bị chạm.
- `npm test` nếu package có script test.
- Chạy lệnh kiểm mojibake theo mẫu trong `AGENTS.md` và phân loại hit thật, hit false-positive do tiếng Việt hợp lệ.
- Test gửi tin local: message shop xuất hiện ngay bằng `client_temp_id`.
- Test adapter lỗi: message chuyển `failed`, có nút gửi lại.
- Test sync message có `platform_message_id`: merge vào message cũ, không duplicate.
- Kiểm mobile/tablet/PC.
- Nếu deploy: xác nhận profile `shophuyvan-chat-api`, Cloudflare account `39cf0fe9b3eda88bda53e369770cabeb`, Chrome profile `E:\codex-chrome-profiles\shophuyvan-test`.
- GitHub mono-repo `skymax2309/shophuyvan-analytics` được phép ở phase hiện tại; vẫn phải chặn nếu deploy nhầm Worker chính `DuAn_shophuyvan-analytics`.

Kết quả 2026-05-18: production UI mới pass 390/820/1366px với đủ badge capability, safe send `sending -> failed`, retry button và sync không duplicate. Production đã kiểm thêm `manual_pending` và `queued_for_browser_helper`; test data prefix `codex_cap_` đã dọn khỏi D1. Chưa xóa legacy vì chưa nối live Shopee bridge và chưa đủ parity tất cả tab cũ.
