# ShopHuyVan Chat Worker API

Worker riêng cho Chat/CSKH marketplace trong giai đoạn mono-repo `shophuyvan-analytics`.

## Chiến lược deploy hiện tại

- Code vẫn nằm trong `E:\shophuyvan-analytics\apps\chat-worker-api`.
- GitHub repo hiện tại được phép là `skymax2309/shophuyvan-analytics`.
- Cloudflare bắt buộc dùng profile riêng `shophuyvan-chat-api`.
- Worker: `shophuyvan-chat-api`.
- Production URL hiện tại: `https://shophuyvan-chat-api.zacha030596.workers.dev`.
- D1: `shophuyvan-chat-db` (`25574cfd-ee6b-4128-af7b-fdfe1aa91e96`).
- R2: `shophuyvan-chat-files`.
- KV/Queue chưa bật trong `wrangler.toml` cho đến khi tạo resource thật; tên dự kiến là `shophuyvan-chat-kv` và `shophuyvan-chat-queue`.
- Repo riêng `zacha030596-dev/shophuyvan-chat` là hướng tương lai, không dùng làm blocker hiện tại.

Không deploy Worker chính `DuAn_shophuyvan-analytics` khi chỉ làm Chat/CSKH.

## Chạy local

```powershell
cd E:\shophuyvan-analytics\apps\chat-worker-api
npm test
npx wrangler dev --local
```

Health local:

```powershell
Invoke-RestMethod http://127.0.0.1:8787/api/chat/health
```

UI local có thể trỏ API về Worker local bằng console hoặc localStorage:

```js
localStorage.setItem('shv_chat_api_base', 'http://127.0.0.1:8787')
```

## Kiểm tra trước deploy

Chạy ở repo root:

```powershell
$js = Get-ChildItem apps\chat-worker-api\src, apps\fe\js\dashboard\chat -Recurse -Filter *.js
$js | ForEach-Object { node --check $_.FullName }
npm test --prefix apps\chat-worker-api
```

Sau đó chạy đúng lệnh quét mojibake/token theo `AGENTS.md`. Không ghi lại token prefix thật trong README để tránh self-hit khi scan.

Nếu quét mojibake có hit thật trong tiếng Việt, dừng lại và sửa encoding UTF-8 trước khi deploy.

## Capability theo shop/kênh

Chat Worker dùng một Chat Core chung cho mọi kênh, nhưng mỗi conversation phải có capability rõ theo `channel + shop_id`:

- `shop_chat_mode`: `api`, `browser_helper`, `manual`, `disabled`.
- `send_capability`: `official_api`, `bridge`, `manual_only`, `none`.
- `sync_capability`: `webhook`, `polling_api`, `browser_helper`, `manual_import`, `none`.

Shop có API đi `official_api` hoặc `bridge` và chỉ ghi `sent` khi adapter trả thành công thật. Shop không API không được fake success: gửi tay chuyển `manual_pending`, helper trình duyệt chuyển `queued_for_browser_helper`, chưa cấu hình chuyển `failed` với `adapter_not_configured`.

UI `chat-cskh.html` phải render badge từ capability backend trả về: `API chính thức`, `Bridge`, `Browser helper`, `Gửi tay`, `Chưa cấu hình`.

AI hiện chạy `suggest_only`. Auto-send chỉ được xét khi `send_capability` là `official_api` hoặc `bridge` và đã có rule an toàn.

## Verify profile Cloudflare

Token chỉ đọc từ `profiles.local.json` và set vào process PowerShell hiện tại. Không in token ra terminal, README, log hoặc commit.

```powershell
$profile = (Get-Content E:\shophuyvan-analytics\profiles.local.json -Raw -Encoding UTF8 | ConvertFrom-Json).'shophuyvan-chat-api'
if (!$profile) { throw 'Thiếu profile shophuyvan-chat-api trong profiles.local.json' }
$env:CLOUDFLARE_API_TOKEN = $profile.cf_api_token
$env:CLOUDFLARE_ACCOUNT_ID = $profile.cf_account_id
if ($env:CLOUDFLARE_ACCOUNT_ID -ne '39cf0fe9b3eda88bda53e369770cabeb') { throw 'Sai Cloudflare account cho Chat/CSKH' }
cd E:\shophuyvan-analytics\apps\chat-worker-api
npx wrangler whoami
```

Nếu CLI báo `Invalid access token`, `Authentication error`, hoặc account id khác `39cf0fe9b3eda88bda53e369770cabeb`, dừng deploy và yêu cầu cập nhật profile local.

## Dry-run deploy

```powershell
cd E:\shophuyvan-analytics\apps\chat-worker-api
npx wrangler deploy --dry-run
```

Dry-run pass chưa phải production pass.

## Deploy production

Chỉ chạy sau khi `whoami`, test và dry-run pass:

```powershell
cd E:\shophuyvan-analytics\apps\chat-worker-api
npx wrangler deploy
```

Sau deploy phải kiểm:

```powershell
Invoke-RestMethod https://shophuyvan-chat-api.zacha030596.workers.dev/api/chat/health
Invoke-RestMethod https://shophuyvan-chat-api.zacha030596.workers.dev/api/chat/conversations
```

Không dùng domain Worker chính `huyvan-worker-api.nghiemchihuy.workers.dev` cho Chat Worker riêng.

## Production verify mới nhất

- Chat Worker version: `15b7d0bb-5d48-4897-9dea-ec35a69a556b`.
- Static UI version: `1d776058-82ed-4d25-ab55-17ddc9fe8d41`.
- UI: `https://shophuyvan-analytics.nghiemchihuy.workers.dev/pages/chat-cskh.html`.
- Đã kiểm mobile `390x844`, tablet `820x1180`, desktop `1366x900` bằng Chrome profile `E:\codex-chrome-profiles\shophuyvan-test`.
- Đã kiểm các mode `official_api`, `bridge`, `manual`, `browser_helper`, `disabled`; test data prefix `codex_cap_` đã xóa khỏi D1 production.

## Shopee bridge

Shopee text live đang đi qua bridge nội bộ của Worker chính:

- `SHOPEE_CHAT_BRIDGE_URL`: `https://huyvan-worker-api.nghiemchihuy.workers.dev/api/internal/chat-bridge/shopee`.
- `SHOPEE_CHAT_BRIDGE_SECRET`: set bằng `wrangler secret put`, không ghi vào file.
- Worker chính dùng secret tương ứng `CHAT_BRIDGE_INTERNAL_SECRET`.
- Endpoint gửi: `POST /api/internal/chat-bridge/shopee/messages/send`.
- Auth nội bộ: header `X-Chat-Bridge-Secret`.
- Worker chính xử lý bridge trong `apps/worker-api/src/routes/marketplace-chat/shopee-bridge.js`, gọi SellerChat API chính thức và không dùng lại router Chat legacy.

Nếu thiếu URL hoặc secret, adapter phải trả `adapter_not_configured`, message chuyển `failed`, UI hiện nút gửi lại và không fake success. Nếu bridge trả lỗi Shopee, Chat Worker giữ status `failed` và lưu `error_code/error_message`.

## Shopee full inbox polling

Route mới:

```powershell
Invoke-RestMethod `
  -Method POST `
  -Uri https://shophuyvan-chat-api.zacha030596.workers.dev/api/chat/sync `
  -ContentType 'application/json' `
  -Body '{"channel":"shopee","shop_id":"chihuy1984","limit":20,"page_size":20}'
```

Luồng runtime:

1. Chat Worker gọi bridge `POST /api/internal/chat-bridge/shopee/sync`.
2. Worker chính gọi `GET /api/v2/sellerchat/get_conversation_list`.
3. Nếu conversation mới hoặc `last_message_timestamp` thay đổi thì Worker chính gọi `GET /api/v2/sellerchat/get_message`.
4. Chat Worker normalize message và merge vào D1 theo `platform_message_id`; nếu outbound đã `sent` thì giữ cùng row và giữ status `sent`.
5. Sync state lưu ở `chat_sync_state` và snapshot conversation: `last_synced_at`, `last_success_at`, `last_error_code`, `last_error_message`, `pulled_conversations`, `pulled_messages`, `saved_messages`, `skipped_duplicates`, `sync_cursor`, `last_message_timestamp`.

Timestamp Shopee đã verify:

- `last_message_timestamp`: Unix nanoseconds.
- `created_timestamp`: Unix seconds.

Worker chính dùng `normalizeShopeeTimestamp()` để nhận seconds, milliseconds, microseconds, nanoseconds, numeric string hoặc ISO string; parse lỗi trả rỗng/null có kiểm soát, không throw `Invalid time value`.

Shop Shopee chưa có API không được gọi SellerChat API. Bridge trả capability manual/helper/disabled tương ứng và `error_code=shop_api_not_configured` hoặc lỗi thật; Chat Worker không fake success.

Production verify 2026-05-18:

- Chat Worker version: `15b7d0bb-5d48-4897-9dea-ec35a69a556b`.
- Worker chính bridge/readback/polling version: `233760a9-2469-4792-8b0d-284457d8f81c`.
- Live text send qua Chat Worker -> bridge -> Shopee pass, Shopee trả `platform_message_id=2414019124426817905`.
- Readback Shopee SellerChat pass qua Worker chính:
  - Conversation list: `GET /api/v2/sellerchat/get_conversation_list`, dùng `shop_id`, `direction`, `type`, `page_size`; timestamp `last_message_timestamp` là Unix nanoseconds.
  - Message history: `GET /api/v2/sellerchat/get_message`, dùng `shop_id`, `conversation_id`, `page_size`; message trả `message_id`, `from_id`, `to_id`, `from_shop_id`, `to_shop_id`, `message_type`, `content.text`, `conversation_id`, `created_timestamp`; timestamp `created_timestamp` là Unix seconds.
  - `normalizeShopeeTimestamp()` trong Worker chính nhận seconds/milliseconds/microseconds/nanoseconds/ISO string và parse fail thì trả rỗng để không còn `Invalid time value`.
  - Chat Worker dedupe theo `platform_message_id` xuyên qua alias shop name/api shop id; message đã gửi vẫn giữ status `sent`.
- Bridge không có secret trả HTTP `401`.
- Attachment chưa bật live, bridge trả `attachment_bridge_not_ready`.
- D1 Chat Worker còn đúng `1` row theo `platform_message_id=2414019124426817905`, status `sent`.
- Full inbox polling shop API `chihuy1984`: lượt 1 kéo `20` conversation, `53` message và lưu `53`; lượt lặp không lưu thêm (`pulled_messages=0`, `saved_messages=0`).
- Shop chưa API `khogiadungcona`: không gọi SellerChat API; capability `manual/manual_only/manual_import`, `error_code=shop_api_not_configured`.

Lazada, TikTok, Facebook, Zalo hiện là skeleton `adapter_not_implemented` cho tới khi có adapter chính thức hoặc fallback vận hành được chốt riêng.
