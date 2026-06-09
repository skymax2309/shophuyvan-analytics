## 2026-05-31 - Flash Sale cleanup/readback re-verify (Shopee chihuy1984)

- Endpoint đã kiểm trực tiếp: `/api/v2/shop_flash_sale/get_shop_flash_sale_list`, `/api/v2/shop_flash_sale/create_shop_flash_sale`, `/api/v2/shop_flash_sale/add_shop_flash_sale_items`, `/api/v2/shop_flash_sale/delete_shop_flash_sale`, `/api/v2/shop_flash_sale/get_shop_flash_sale_items`.
- Endpoint đã dùng thật trong lượt này:
  - `POST /api/discounts/flash-auto/run` (`force_submit=true`) -> live-write gửi lên Shopee thành công.
  - `POST /api/discounts/shopee/promotion-action` (`module=shop_flash_sale`, `action=delete`) để xóa chương trình lỗi.
  - `GET /api/discounts/flash-deal/items?shop=...&timeslot_id=...` để readback item theo từng slot.
- Kết quả xóa chương trình lỗi:
  - Local read-model ban đầu có `28` record upcoming `item_count=0`.
  - Xóa thật trên sàn thành công `2` ID; `26` ID trả `shop_flash_sale_not_exist` (không còn tồn tại trên sàn).
  - Đã cleanup cache local bằng `/api/discounts/promotion-cache/delete` (`confirm=DELETE_CACHE_ONLY`) cho toàn bộ stale IDs.
  - Sau cleanup local: còn `5` upcoming, `0` upcoming `item_count=0`.
- Readback live sau fix:
  - Sync trực tiếp từ Shopee (`/api/discounts/shopee/promotions/sync`) trả `status=ok`, upcoming live `5`, zero-item `0`.
  - Readback item thật của 5 chương trình upcoming đều >0 (2/2/6/7/8 item theo từng slot).
- Thiếu quyền/token: không phát sinh `api_permission_missing` hoặc `token_scope_missing` trong lượt verify này.
- Endpoint không có: Lazada Flash Sale family vẫn `endpoint_not_available` (không đổi).
## 2026-05-31 - Cleanup flash sale lỗi 0 sản phẩm (Shopee)

- Evidence check: `get_shop_flash_sale_list` cho shop `chihuy1984` có nhiều record `enabled_item_count=0`.
- Cleanup action: gọi `delete_shop_flash_sale` cho toàn bộ record `type=1` + `enabled_item_count=0`.
- Result: `24/24` deleted, `0` failed.
- Post-check: type=1 còn 1 record, không còn record type=1 bị 0 item.
## 2026-05-31 - Flash Sale no_items_added guard

- Added strict guard for Shopee add-items response:
  - Parse `response.failed_items` for `/api/v2/shop_flash_sale/add_shop_flash_sale_items`.
  - If accepted units = 0 -> return error `no_items_added` (no false success).
- Worker deploy: `9bf6f3a5-9705-405a-96ea-20e1e6b2f8e5`.
## 2026-05-31 - Flash Sale endpoint/live-write checklist update

- Scope: Flash Sale auto run-now path (`/api/discounts/flash-auto/*`, `/api/discounts/flash-deal/*`).
- Endpoint checked (official):
  - Shopee: `get_time_slot_id`, `get_shop_flash_sale_list`, `create_shop_flash_sale`, `add_shop_flash_sale_items`, `update_shop_flash_sale_items`, `delete_shop_flash_sale_items`.
  - Lazada: không có public endpoint họ Flash Sale create/list/add/update/delete item -> `endpoint_not_available`.
- Endpoint used in code: Shopee `shop_flash_sale/*` (adapter ở `apps/worker-api/src/routes/discounts/flash-deal-endpoints.js`).
- Permission handling:
  - Route live-write thêm guard admin cho `POST /api/discounts/flash-deal/items/add`.
  - Nếu token/quyền thiếu phải map `api_permission_missing` hoặc `token_scope_missing`.
- Production verify:
  - `GET /api/discounts/flash-deal/timeslots?shop=chihuy1984`: đã từ `400 shop_flash_sale_param_error` -> `200` sau fix default `start_time/end_time`.
  - `POST /api/discounts/flash-auto/run` không auth: `403 admin_required` (đúng guard).
- Deploy Worker mới nhất: `e10ec7c9-1b21-4f04-8510-7473f1ec5af4`.
- Fallback: chưa dùng Seller Center fallback cho shop API.
## 2026-05-30 - Flash Sale auto endpoint hotfix (deployed, partial-verified)

- Scope: Flash Sale auto run-now path `/api/discounts/flash-auto/*`.
- Endpoint checked: Shopee `shop_flash_sale` family (`get_time_slot_id`, `create_shop_flash_sale`, `add_shop_flash_sale_items`, `get_shop_flash_sale_items`).
- Endpoint used in code after patch: switched adapter in `apps/worker-api/src/routes/discounts/flash-deal-endpoints.js` from `flashdeal/*` to `shop_flash_sale/*`.
- Permission state: `partial_verified` (đã re-run production batch; chưa verify UI 3 viewport).
- Missing permission/token: nếu gặp sẽ map `api_permission_missing` hoặc `token_scope_missing` từ engine message.
- Fallback reason: chưa dùng Seller Center fallback; vẫn đi Open Platform endpoint trước.
- Readback production (`chihuy1984`): đã hết `error_not_found`; batch trả `prepared`, `timeslot_id=274064455839744`, `items_submitted=40`, message cho biết đã chuẩn bị danh sách và chưa tự submit.
- Deploy versions: Worker `b70fe800-7b2d-420b-a96e-b5e52a1ea5e3`; static `61a5c7c1-00b8-4575-9fe8-b09a58701e95`.
- Next: verify UI production desktop/tablet/mobile bằng profile `E:\codex-chrome-profiles\shophuyvan-test` và xác nhận luồng bật/tắt/run-now trên màn hình thật.
### 2026-05-28 - Zalo/Facebook social policy + Zalo local send bridge

- `Phạm vi`: Social chat trong Chat/CSKH; không thêm endpoint marketplace official mới.
- `Đã dùng`: `POST http://127.0.0.1:8794/api/shophuyvan-chat/send`, Chat Worker `/api/chat/browser-helper/push`, `/api/chat/policy/check`.
- `Đã sửa`: Zalo browser-helper trong UI được gửi qua helper local thay vì lưu bản nháp; Zalo/Facebook không dùng restricted keyword policy của shop sàn.
- `Shop có API`: Shopee/Lazada/TikTok vẫn bị policy marketplace chặn từ khóa kéo khách ra ngoài sàn; gửi live giữ endpoint/capability hiện có.
- `Shop không API/social`: Zalo dùng local browser-helper bridge, source rõ là `browser_helper`; Facebook chỉ trạng thái social riêng, chưa live-write.
- `Thiếu quyền/không có endpoint`: không phát sinh lỗi quyền/token. Zalo official API chat chưa dùng; fallback local browser helper vì đã có profile đăng nhập và bridge token.
- `Deploy/verify`: Chat Worker `e2d8803c-b534-4581-bdd9-7fe7378365b4`; static `46b0e809-2c05-4c54-a615-03612feafce9`; Settings/Chat production pass desktop/tablet/mobile.

### 2026-05-28 - Chat AI phase 2/3/4 auto-simple + learning controls

- `Phạm vi`: Chat Worker AI/Gemini + Chat/CSKH UI evidence; không thêm endpoint marketplace mới.
- `Đã dùng`: Chat Worker `/api/chat/ai/suggest`, `/api/chat/ai/status`, `/api/chat/ai/approve`, `/api/chat/ai/reject`; Worker Core read-only `GET /api/core/orders/:orderId`, `GET /api/core/orders/by-conversation/:conversationId`, `GET /api/core/products/by-sku/:sku`, `GET /api/core/products/search`.
- `Đã sửa`: `CHAT_AI_MODE=auto_simple`; chỉ auto-send câu hỏi đơn hàng/sản phẩm đơn giản khi context Core đủ và policy/capability pass. UI hiện `AI đã soạn từ dữ liệu đã kiểm`, nút `Duyệt học`/`Hủy học`.
- `Shop có API`: Shopee/Lazada vẫn gửi qua official API/bridge hiện có; auto-simple bị chặn nếu thiếu dữ liệu Core, có warning/risk, policy blocked, hoặc capability không live-send.
- `Shop không API`: dùng dữ liệu đã vào Warehouse/Core; không gắn nhãn API và không live-send nếu capability là manual/browser-helper/none.
- `Thiếu quyền/không có endpoint`: không phát sinh `api_permission_missing`, `token_scope_missing`, `endpoint_not_available`; warning Product Core search tên dài K75 đã xử lý ở Worker chính `204213c9-6b18-4b49-8c73-50712e17ec4c`.
- `Deploy/verify`: Chat Worker `62809e20-a2d0-4f1f-a407-2c4212eb6ca9`, static `59c78837-7637-4bda-8130-afa431ea3d59`; production API dry-run 3 hội thoại không auto-send do guard; UI desktop/tablet/mobile pass.

### 2026-05-28 - Chat AI Context Builder Order/Product Core suggest-only

- `Phạm vi`: Chat Worker AI/Gemini context; không thêm endpoint marketplace mới và không live-send tự động trong phase này.
- `Đã dùng`: Chat Worker `/api/chat/ai/suggest`, `/api/chat/ai/status`; Worker Core read-only `GET /api/core/orders/:orderId`, `GET /api/core/orders/by-conversation/:conversationId`, `GET /api/core/products/by-sku/:sku`, `GET /api/core/products/search`.
- `Đã sửa`: Gemini prompt có context cấu trúc từ Chat Core + Order/Product Core, có warnings/risk flags, không đưa cost/raw payload. `CHAT_AI_MODE=suggest_only` ép `auto_send=false`, `policy_status=needs_review`.
- `Shop có API`: Shopee/Lazada đọc dữ liệu đã vào Core/snapshot qua Worker chính, gửi live vẫn bị giữ ở draft/suggest nếu policy chưa được duyệt phase sau.
- `Shop không API`: chỉ dùng dữ liệu đã nhập Warehouse/Core từ import/browser helper/manual; không gắn nhãn API và không dùng Seller Center fallback mới.
- `Thiếu quyền/không có endpoint`: không phát sinh `api_permission_missing`, `token_scope_missing`, `endpoint_not_available`; warning Product Core search tên dài K75 đã xử lý ở Worker chính `204213c9-6b18-4b49-8c73-50712e17ec4c`.
- `Deploy/verify`: Chat Worker `6021d457-6ab8-431a-9497-a057192f6fcc`; production dry-run hội thoại Lazada thật `order_count=1`, `product_count=3`, `auto_send=false`.

### 2026-05-28 - Chat/AI Gemini key append fix

- `Phạm vi`: Chat Worker settings/AI + static Settings UI; không thêm endpoint sàn mới.
- `Đã dùng`: `GET /api/chat/ai/status`, `POST /api/chat/settings`; production readback `gemini_key_count=2`, `ai_status=active`.
- `Đã sửa`: `gemini_api_keys_input` là thao tác thêm key mới vào danh sách hiện có, không replace key cũ; `gemini_api_keys` chỉ dùng cho replace có chủ đích trong hệ thống/reset.
- `Shop có API`: Chat auto-send vẫn chỉ đi qua capability `official_api` hoặc `bridge`; thay đổi này chỉ ảnh hưởng kho key Gemini dùng để soạn/gợi ý AI.
- `Shop không API`: không gắn nhãn gửi API; không dùng Seller Center fallback cho việc lưu Gemini key.
- `Thiếu quyền/không có endpoint`: không phát sinh endpoint marketplace mới và không phát hiện thiếu quyền ở Chat settings/AI status.
- `Deploy/verify`: Chat Worker `fde42ef4-81ce-4c38-afdc-696a6563d956`, static `399e0247-08e2-4cf6-89e0-ad2b9e9bbdfa`; Settings production pass desktop/tablet/mobile.

### 2026-05-28 - Chat/AI key count, học AI và auto-reply

- `Phạm vi`: Chat Worker riêng `shophuyvan-chat-api` + static Settings/Chat UI; không deploy Worker chính và không thêm endpoint marketplace live-write mới.
- `Đã dùng`: `GET /api/chat/ai/status`, `GET/POST/DELETE /api/chat/ai/knowledge`, `POST /api/chat/ai/approve`, `GET/POST /api/chat/settings`, `GET /api/chat/settings/stats`, cron Chat Worker `*/2 * * * *`.
- `Đã kiểm`: production trả `ai_status=active`, `gemini_key_count=1`, `allow_auto_send=true`, `auto_reply_minutes=5`; Knowledge Base tạo/xóa test entry thành công.
- `Shop có API`: auto-reply chỉ chạy khi conversation có `send_capability=official_api` hoặc `bridge`; Shopee/Lazada vẫn đi Chat Core/bridge hiện có.
- `Shop không API`: TikTok/manual/browser-helper không được gắn nhãn auto-send API; auto-reply bỏ qua nếu capability không live-send.
- `Thiếu quyền/không có endpoint`: không phát sinh endpoint sàn mới; nếu bridge thiếu quyền/token, Chat Core giữ lỗi capability hiện có và auto-reply không gửi.
- `Deploy/verify`: Chat Worker `c99b6b56-2f04-442a-8c51-61cf2cb2c8f8`, static `0c59ad14-b97f-4998-9cf2-28ceb2ac2784`; Settings production pass desktop/tablet/mobile, key count và learning count hiện đúng.

### 2026-05-28 - Chat outbound policy chặn SĐT/domain

- `Phạm vi`: Chat Worker policy + static Chat/Settings UI; không thêm endpoint marketplace Shopee/Lazada/TikTok mới.
- `Đã dùng`: internal Chat Worker `/api/chat/policy/check` để preview và kiểm trước khi gửi; route gửi tin vẫn qua Chat Core/bridge hiện có sau khi policy cho phép.
- `Đã kiểm`: production API chặn `0909128999 shophuyvan.vn` với `blocked_terms=["định dạng số điện thoại","định dạng website"]`, không trả settings/secret; câu đơn hàng hợp lệ vẫn `allowed=true`.
- `Shop có API`: Shopee/Lazada vẫn gửi/sync qua official API/bridge hiện có, nhưng text bị chặn ở Chat Worker trước khi gọi adapter nếu chứa SĐT/domain.
- `Shop không API`: TikTok/manual/browser-helper vẫn draft/helper, cùng policy chặn trước khi lưu/gửi tay; không gắn nhãn đồng bộ API mới.
- `Thiếu quyền/không có endpoint`: không phát sinh `api_permission_missing`, `token_scope_missing`, `endpoint_not_available`.
- `Deploy/verify`: Chat Worker `d5d674e4-7d2b-46e4-9cd8-b0beab88a969`, static `95b003c3-efc4-4acb-adbf-cce91f8c6696`; `/settings` và `/pages/chat-cskh` production pass desktop/tablet/mobile, không tràn ngang, nhập `0909128999 shophuyvan.vn` không append tin.

### 2026-05-28 - Trang chủ thêm lối tắt Cài đặt Chat

- `Phạm vi`: chỉ sửa static UI trang chủ, không thêm endpoint sàn mới.
- `Đã dùng`: link `/settings` dẫn tới trang cài đặt Chat/AI hiện có; không đổi Chat Worker route.
- `Đã kiểm`: production trang chủ có card `Cài đặt Chat`; bấm mở `/settings`, không tràn ngang desktop/tablet/mobile.
- `Shop có API`: Shopee/Lazada giữ luồng Chat Core/capability hiện tại, không dùng Seller Center fallback.
- `Shop không API`: TikTok/manual/browser-helper giữ fallback hiện tại, không gắn nhãn API mới.
- `Thiếu quyền/không có endpoint`: không phát sinh `api_permission_missing`, `token_scope_missing`, `endpoint_not_available`.
- `Deploy/verify`: static `shophuyvan-analytics` version `355b02f9-ee19-470e-a7cc-7e78af8a5e61`.

### 2026-05-28 - Khuyến mãi sàn tab con Flash Sale tự động

- `Phạm vi`: static UI `Khuyến mãi sàn`; không thêm endpoint marketplace mới và không đổi backend Flash Auto.
- `Đã dùng`: trang cha `pages/promotions.html` gọi lại route hiện có `/api/discounts/flash-auto/settings/all`, `/api/discounts/flash-auto/settings`, `/api/discounts/flash-auto/run`, `/api/discounts/flash-auto/logs` và read-model khuyến mãi cũ cho các tab chương trình.
- `Đã kiểm`: production UI có tab con `Flash Sale tự động/Tổng quan/Shopee giảm giá/Voucher/Combo/Mua kèm/Lazada`; không còn layout Flash Auto độc lập trong menu `Khuyến mãi sàn`.
- `Shop có API`: Shopee `chihuy1984`, `chihuy2309`, `phambich2312` giữ Shopee Flashdeal qua Worker API; không dùng Seller Center fallback.
- `Shop không có Flash Auto`: Lazada `kinhdoanhonlinegiasoc` đang disabled cho Flash Auto, UI hiển thị tắt/chưa kết nối thay vì giả đồng bộ Flash Sale.
- `Thiếu quyền/không có endpoint`: không phát sinh mã mới trong lượt UI này; blocker cũ vẫn là Shopee Flashdeal production trả `error_not_found` khi lấy timeslot/run.
- `Deploy/verify`: static `shophuyvan-analytics` version `1103b251-13c0-4179-ada6-f98b54dacd3d`; desktop/tablet/mobile pass `overflowX=false`, tab con bấm được, toast run-now xuất hiện.

### 2026-05-28 - ADS automation ROAS toàn chiến dịch và bật lại campaign

- `Phạm vi`: sửa Worker ADS automation settings/evaluation engine và static UI tab `Cài đặt`; không thêm endpoint marketplace mới, không gọi live-write thủ công.
- `Đã dùng`: `/api/ads/automation/settings` để readback/lưu setting tự động; Evaluation Engine dùng `roas_target`, `auto_resume_enabled`, `resume_roas_multiplier`, `resume_stock_multiplier`, `max_resume_per_day` khi đề xuất tăng ngân sách hoặc bật lại campaign.
- `Đã kiểm`: production settings trả `roas_target=20` map từ cấu hình cũ `good_roas=20`; UI production không còn panel thủ công, có ROAS mục tiêu toàn chiến dịch và toggle tự bật lại.
- `Shop có API`: Shopee `chihuy1984`, `chihuy2309`, `phambich2312` và Lazada `kinhdoanhonlinegiasoc@gmail.com` giữ luồng Open Platform/Worker API hiện có; không dùng Seller Center fallback.
- `Shop không API`: fallback/manual/browser-helper giữ nguyên; không gắn nhãn API mới.
- `Thiếu quyền/không có endpoint`: không phát sinh `api_permission_missing`, `token_scope_missing`, `endpoint_not_available`.
- `Deploy/verify`: Worker `661da300-3a63-4ff0-91c8-ea7ae1055c4c`, static `9ddf1c73-03b7-44f1-8a72-de13bd7ec7c8`; desktop/tablet/mobile pass `overflowX=false`.

### 2026-05-28 - ADS redesign UI và xu hướng 7 ngày

- `Phạm vi`: chỉ sửa static UI ADS, không thêm endpoint marketplace mới, không đổi adapter live-write và không deploy Worker API.
- `Đã dùng`: Worker API hiện có `/api/ads/dashboard` cho dữ liệu dashboard và chart 7 ngày, `/api/ads/campaign-guard/overview`, `/api/ads/automation/logs`, `/api/ads/automation/last-run-summary` cho trạng thái/luật/log.
- `Đã kiểm`: production API `/api/ads/dashboard?from=2026-05-22&to=2026-05-28` trả đủ 7 ngày ADS thật; UI đã sửa để chart luôn gọi 7 ngày gần nhất riêng, không bị filter hôm nay làm còn 1 ngày.
- `Shop có API`: Shopee `chihuy1984`, `chihuy2309`, `phambich2312` và Lazada `kinhdoanhonlinegiasoc@gmail.com` giữ luồng ADS/Open Platform/Worker API hiện có; không dùng Seller Center fallback.
- `Shop không API`: không đổi fallback/manual/browser-helper; không gắn nhãn đồng bộ API mới.
- `Thiếu quyền/không có endpoint`: không phát sinh `api_permission_missing`, `token_scope_missing`, `endpoint_not_available`.
- `Deploy/verify`: static `shophuyvan-analytics` version `ba350301-eb6e-4003-bc95-d328c1668942`; production desktop/tablet/mobile pass, chart 7 ngày đủ dữ liệu, Top SKU không overlap.

### 2026-05-28 - Chat/CSKH AI settings UI

- `Đã dùng`: Chat Worker `/api/chat/settings` cho lưu panel AI/Gemini/từ khóa/bộ nhớ; production readback `POST=204`, `GET=200` khi bấm `Lưu API Gemini`.
- `Không phát sinh endpoint marketplace mới`: không thêm Shopee/Lazada/TikTok endpoint trong lượt UI này.
- `Shop có API`: giữ Shopee/Lazada chat capability/bridge hiện tại, không dùng Seller Center fallback.
- `Shop không API`: giữ TikTok/manual/browser-helper draft/helper, không giả lập gửi API.
- `Thiếu quyền/không có endpoint`: không phát sinh `api_permission_missing`, `token_scope_missing`, `endpoint_not_available` mới.

### 2026-05-27 - Chat/CSKH AI policy + notification switch

- `Đã xong`: Chat/CSKH có workspace `Cài đặt AI`, bộ nhớ kiến thức sàn, từ khóa hạn chế, lưu Gemini 1-5 key để xoay vòng và response settings không lộ raw key.
- `Đã dùng`: Chat Worker routes `/api/chat/settings`, `/api/chat/ai/test`, `/api/chat/ai/suggest`, `/api/chat/notifications/status|subscribe|unsubscribe|test`; gửi text vẫn qua Chat Worker và marketplace bridge hiện có.
- `Endpoint đã kiểm`: Shopee SellerChat `/api/v2/sellerchat/*`, Lazada IM `/im/*`, TikTok hiện không có official chat send trong hệ thống; policy/rule tham chiếu từ tài liệu chính thức Shopee/Lazada/TikTok, không thêm live-write marketplace endpoint mới.
- `Shop có API`: Shopee/Lazada tiếp tục gửi/sync qua official API/bridge khi capability cho phép; AI chỉ gợi ý/tự gửi khi backend policy không chặn và capability là `official_api` hoặc `bridge`.
- `Shop không API`: TikTok/manual/browser-helper vẫn chỉ draft/helper; không gắn nhãn API và không tự gửi nếu không có capability.
- `Thông báo`: Web Push server-side đã có subscription route + VAPID ở Chat Worker; desktop production bật được công tắc Notification, subscription API đã test save/unsubscribe. Thiết bị mobile thật cần bật switch trên chính trình duyệt/PWA để tạo subscription thật.
- `Deploy/verify`: Chat Worker `d415164a-a7ab-4d6b-ab9a-a5fa5e15ead8`, Static `5007da05-5d13-4f35-82f5-f19b652bf45e`; desktop/tablet/mobile pass, keyword `zalo` bị chặn trước khi gửi.

### 2026-05-27 - ADS rule settings UI cleanup

- `Phạm vi`: chỉ chỉnh static UI tab `Luật tự động ADS` trong `apps/fe/css/ads/ads-page.css` và cache-bust `apps/fe/pages/ads.html`; Worker/API/Core không đổi.
- `Endpoint đã kiểm`: không phát sinh endpoint mới trong lượt giao diện này. Các route ADS/Open Platform hiện có giữ nguyên; không gọi Seller Center fallback cho shop có API.
- `Đã dùng`: static production `shophuyvan-analytics` version `75e2e11a-4b10-4372-9262-2ca4d1c37ff2`; UI vẫn render từ read-model/Core hiện có.
- `Thiếu quyền`: không phát sinh `api_permission_missing` hoặc `token_scope_missing`.
- `Không có endpoint`: không ghi `endpoint_not_available` vì không có yêu cầu endpoint mới.
- `Shop có API`: Shopee `chihuy1984`, `chihuy2309`, `phambich2312` và Lazada `kinhdoanhonlinegiasoc@gmail.com` không đổi luồng API/Worker/Core.
- `Shop không API`: không đổi fallback; không gắn nhãn đồng bộ API mới.
- `Production UI`: Chrome visible profile `E:\codex-chrome-profiles\shophuyvan-test` pass desktop `1366x900`, tablet `820x1180`, mobile `390x844` cho `Điều kiện đánh giá` và `Giới hạn an toàn`; không tràn ngang, không login wall, không console issue.

### 2026-05-27 - Shopee Chat unread/read sync lock

- `Đã kiểm và dùng`: Shopee SellerChat `/api/v2/sellerchat/get_conversation_list`, `/api/v2/sellerchat/get_one_conversation`, `/api/v2/sellerchat/get_message` qua bridge API -> Chat Core -> UI.
- `Đã sửa`: message lịch sử bị trả lại khi polling không còn tăng `unread_count` hoặc làm lùi `last_message_text/last_message_at`; UI đợi hoàn tất Sync trước khi reload.
- `Read endpoint`: `/api/v2/sellerchat/read_conversation` đã được nối từ trước nhưng readback production từng trả `param_error`; trạng thái đọc đã xác nhận trong lượt này là Chat Core local read, không tuyên bố Shopee platform đã nhận read.
- `Dữ liệu production`: dọn `13` hội thoại đã có tin trả lời cuối từ shop nhưng badge cũ còn sót; sau Sync lặp lại không còn hội thoại answered nào hiện unread.
- `Deploy/production`: Chat Worker `565616af-7f81-4235-a97f-b11b101c97b4`, static `da275551-9137-4f5f-9dd3-691e58ef0df2`; `tien2612` pass Sync/reload desktop/tablet/mobile.

### 2026-05-27 - TikTok Chat sender / product-card và OMS deep-link

- `TikTok no-API 0909128999`: dùng browser helper headful -> Chat Core; Chat Core chuẩn hóa sender shop/hệ thống trước khi UI render. Đã repair production `5` system + `4` shop preview rows sai loại.
- `TikTok Chat/Product Card`: chưa có endpoint/adapter gửi card trong hệ thống no-API; UI production dùng fallback an toàn: xác minh sản phẩm từ Product Core rồi chèn vào bản nháp gửi tay, không giả lập gửi thành công.
- `Shopee API chihuy1984`: OMS `Nhắn khách` dùng Order Core `/api/core/orders/:id/chat-target` và template `/chat-confirmation-template`, rồi mở Chat đúng `customer_id`; không dùng Seller Center fallback.
- `Xác nhận đơn`: đã dùng `draft_only`, chưa bật auto-send thật. Muốn live-send phải có trigger gửi được duyệt và readback theo capability `bridge/official_api`.
- `Production`: Worker chính `fa5432dd-dbf3-43f1-85ed-b66d5b5299e4`; Chat Worker `6674fe30-c103-491c-b25e-4db4cb4b5048`; static `13385bb2-98cb-4d91-bbcc-80036d722130`. Browser pass desktop/tablet/mobile và timeline OMS.

### 2026-05-27 - Chat no-API scheduled sync + context readback

- `Shop có API`: Shopee `chihuy1984/chihuy2309/phambich2312` tiếp tục SellerChat Open Platform; Lazada `kinhdoanhonlinegiasoc@gmail.com` tiếp tục Lazada IM. Không chạy browser helper cho shop API.
- `Shop không API`: TikTok `0909128999` và Shopee `khogiadungcona` dùng browser helper/headful qua local helper `/chat-sync`, ghi Chat Core bằng `POST /api/chat/browser-helper/push`.
- `Endpoint đã dùng`: Chat Worker `/api/chat/browser-helper/push`, `/api/chat/conversations?q=...`; Worker Core `/api/core/orders/by-conversation/*`, `/api/logistics-watch/detail`.
- `Thiếu quyền`: không phát sinh `api_permission_missing` mới; Shopee no-API production trả `status=no_messages` là trạng thái thật của Seller Center, không fake dữ liệu.
- `Production`: Chat Worker `3e97ebc5-82e2-461b-afc7-ef15908c047f`, static `0cbec3a7-f90e-4891-8dce-242288ff74bc`; scheduler last chat `status=ok`, TikTok accepted `20`, Shopee no messages, errors `0`.
- `UI endpoint`: `https://shophuyvan-analytics.nghiemchihuy.workers.dev/pages/chat-cskh.html`; tìm `584128214410102531` hiển thị customer/order/product/tracking, desktop/tablet/mobile pass.

### 2026-05-27 - TikTok Finance Lock ADS ngoài ví/PiShip

- [x] TikTok Seller Center finance/detail tiếp tục là source chuẩn cho doanh thu, phí sàn, thuế, SFR và settlement.
- [x] `ADS ngoài ví` và `PiShip` lấy từ Cost Setting khi Seller Center không trả dòng ngoài ví.
- [x] `ADS ngoài ví` và `PiShip` Cost Setting không nằm trong `Tổng khấu trừ`, `marketplace_fee_total`, `tax_total` hoặc settlement TikTok.
- [x] Regression lock cập nhật: `scripts/test-finance-taxonomy.mjs`, `scripts/test-tiktok-seller-center-finance.mjs`, `scripts/check-oms-core-regression-lock.mjs`.
- [x] Deploy Worker chính `huyvan-worker-api` version `25ae3ebb-f598-4637-8b22-d692aa6b5b39`; static UI không đổi vì chỉ sửa Core/read-model.
- [x] Kiểm OMS production đúng đơn `584211305752462759`: popup `Lợi nhuận` desktop/tablet/mobile hiển thị `ADS ngoài ví -5.500đ`, `PiShip -2.008đ`, `Lãi tạm tính 11.467đ`, không tràn ngang.

### 2026-05-27 - Chat/CSKH order detail payment/timeline read-model

- `Hoàn tất code`: Chat/CSKH order panel render payment method, payment time, carrier, buyer note từ Order/Tracking Core; `Chi tiết` mở timeline từ `/api/logistics-watch/detail`.
- `Endpoint đã kiểm/dùng`: Shopee `/api/v2/order/get_order_detail` (`payment_method`, `pay_time`, `message_to_seller`), Shopee `/api/v2/logistics/get_tracking_info`; Lazada `/orders/get` (`payment_method`, `buyer_note/remarks`, payment time nếu có), Lazada `/logistic/order/trace`.
- `Thiếu quyền`: chưa phát sinh mới trong lượt này; nếu production token/tracking bị khóa sẽ trả `api_permission_missing` từ Core route, không ghi `endpoint_not_available`.
- `Fallback`: shop không API chỉ đọc dữ liệu manual/import/browser-helper đã vào Warehouse/Core; UI không dùng Seller Center fallback cho shop API và không tự suy luận payment/timeline.
- `Production pass`: Worker chính `9885bf85-0104-4ee3-a22e-57dd05fb88bd`, static `847f09bd-2b41-4ed4-81d0-c1643657e1ba`; Chat/CSKH production desktop/tablet/mobile pass với order `260525BY4BCTM7`, nút `Chi tiết` mở timeline vận chuyển thật.
- `Giới hạn dữ liệu`: sample COD `260525BY4BCTM7` chưa có `pay_time` từ Shopee, nên `payment_time` vẫn `Chưa có`; không coi là thiếu endpoint và không tự tạo thời gian giả.

### 2026-05-27 - Lazada Chat IM paging/backfill

- `Đã dùng`: Lazada IM `/im/session/list`, `/im/session/get`, `/im/message/list`, `/im/message/send` qua Worker bridge chính thức; không dùng Seller Center/browser fallback cho shop API `200166591213 / kinhdoanhonlinegiasoc@gmail.com`.
- `Đã sửa`: `start_time` của Lazada IM được dùng như mốc kéo lùi từ hiện tại, không còn đặt mốc quá cũ làm mất tin gần đây. Bridge có session pagination, target conversation backfill, message paging cho hội thoại đang mở, retry `ApiCallLimit`.
- `Readback production`: target `S***y` kéo `9` tin; shop sync `limit=20` kéo `20` hội thoại, `98` tin, lưu `54` tin mới ở lượt đầu; conversation list có ngày `2026-05-26`, `2026-05-25`, `2026-05-24`, `2026-05-22`.
- `Thiếu quyền`: chưa thấy `api_permission_missing`/`token_scope_missing` mới. Tên khách còn mask là dữ liệu Lazada trả về, không tự bịa plaintext.

### 2026-05-27 - OMS order detail evidence: shipping timeline / payment method / customer note

- `Shopee đã kiểm`: `/api/v2/order/get_order_detail` có `payment_method`, `payment_info`, `message_to_seller` trong response; `/api/v2/logistics/get_tracking_info` có `tracking_info[]`; `/api/v2/logistics/get_tracking_number` dùng khi thiếu mã vận đơn; `/api/v2/payment/get_payment_method_list` chỉ là danh mục phương thức thanh toán theo vùng; `/api/v2/payment/get_escrow_detail` là nguồn phí/settlement.
- `Shopee đã dùng`: order detail -> `orders_v2.payment_method/customer_note`; tracking info -> `order_tracking_core`; không thêm Seller Center fallback cho các shop API `chihuy1984`, `chihuy2309`, `phambich2312`.
- `Lazada đã kiểm`: `/orders/get` có `payment_method`, `buyer_note`, `remarks`; `/order/items/get` có package/tracking/item evidence; `/logistic/order/trace` dùng tham số chính thức `ofcPackageIdList` và trả timeline trong `package_detail_info_list[].logistic_detail_info_list[]`; `/finance/transaction/details/get` là nguồn settlement/fee.
- `Lazada đã dùng`: `/orders/get` -> `orders_v2.payment_method/customer_note`; `/order/items/get` + `/logistic/order/trace` -> `order_tracking_core`; shop API `kinhdoanhonlinegiasoc@gmail.com` không dùng browser fallback.
- `Core/UI`: OMS drawer đọc `/api/logistics-watch/detail` và render `Thanh toán`, `Ghi chú khách`, timeline từ read-model; UI không tự gọi Open Platform và không hiển thị raw endpoint/debug cho người vận hành.
- `Trạng thái`: production pass. Worker chính deploy `443ee7b7-cc4b-450b-abec-7af12bdc973c`; static UI deploy `392fb66d-7022-489d-995a-b3517b3bf62d`. Shopee sample `260526E7Q5NGSJ` readback timeline/payment OK; Lazada sample `528922543424254` readback trace/payment OK. Nếu production token/quyền trả lỗi ở đơn khác sẽ ghi `api_permission_missing` hoặc `token_scope_missing`, không ghi `endpoint_not_available`.

### 2026-05-27 - Lazada Chat IM order/product endpoint pass

- `Đã kiểm trực tiếp`: Lazada Open Platform IM doc xác nhận `/im/session/list`, `/im/session/get`, `/im/message/list`, `/im/message/send`; `SendMessage` có `template_id=10006` item message, `10007` order message, `10008` voucher message. Lazada Order guide xác nhận dùng `GetOrder/GetOrderItems`; Product guide/API reference xác nhận `/products/get` và `item_id/skus/images`.
- `Đã dùng`: Worker bridge Lazada `/im/session/list`, `/im/session/get`, `/im/message/list`, `/im/message/send`; Chat UI đọc Order Core `/api/core/orders/by-conversation` và Product Core `/api/core/products/search`.
- `Đã sửa`: parse Lazada IM `content` nhiều lớp JSON, không lưu raw `{"txt":...}`; bóc `imgUrl/itemId/orderId`, lưu ảnh attachment, lưu item message vào Product Knowledge Core để panel Sản phẩm có tên/ảnh/SKU/giá.
- `Shop có API`: Lazada `kinhdoanhonlinegiasoc@gmail.com / 200166591213` chạy Open Platform/bridge -> Chat Core + Product Knowledge Core; không dùng browser automation.
- `Shop không API`: vẫn manual/import/browser helper riêng, không gắn nhãn API.
- `Production`: Worker chính `70330a62-5b90-495a-b61d-643ca28853c2`; Chat Worker `6705efbb-9021-4dc7-a65f-1cd76fda59cb`; FE static `d29155bb-59b7-4d00-bc39-cee47dfa6fe4`.
- `Readback`: sync Lazada kéo `20` hội thoại, `65` tin; target `200006334685` có `customer_name=S***y`, text sạch, 2 ảnh, product `3071608306` vào Product Core, dry-run item card dùng `template_id=10006`, order card dùng `template_id=10007`.

### 2026-05-26 - Chat Core Duoke-style order/product/read UI follow-up

- `Đã dùng`: Chat Worker `POST /api/chat/conversations/:id/read`; Worker bridge `POST /api/internal/chat-bridge/shopee/conversations/read`; Shopee SellerChat `/api/v2/sellerchat/read_conversation`; Order Core `/api/core/orders/by-conversation`; Product Core `/api/core/products/search`.
- `Đã kiểm`: Open Platform/reference và package wrapper xác nhận `read_conversation` cần `conversation_id` + `last_read_message_id`; production thử string id, field variants, raw JSON number64 vẫn trả `param_error`.
- `Shop có API`: tiếp tục đi Open Platform/bridge, cập nhật Chat Core D1; không dùng browser helper/Seller Center fallback cho read-state.
- `Shop không API`: vẫn `manual_import/browser_helper`, không gắn nhãn API.
- `UI/Core`: pass production desktop/tablet/mobile cho order card, product card, AI composer, close detail, read/unread display; còn thiếu platform readback Shopee.

### 2026-05-26 - Shopee Chat order/product/image context fix

- `Đã tra trực tiếp`: Shopee Open Platform FAQ Customer Service App Type xác nhận SellerChat endpoints `get_conversation_list`, `get_message`, `get_one_conversation`, `send_message`, `read_conversation`, `upload_image`, `webchat_push`; Push doc `webchat_push` xác nhận payload message có `image`, `item`, `source_content/order_sn`. Cùng FAQ liệt kê Product API `get_item_list`, `get_item_base_info`, `get_item_extra_info`, `get_model_list` và Order API `get_order_list`, `get_order_detail`.
- `Đã dùng`: Shopee SellerChat bridge tiếp tục dùng `get_conversation_list`, `get_one_conversation`, `get_message`; Chat UI dùng Core endpoint `/api/core/orders/by-conversation` và `/api/core/products/search` để render đơn/sản phẩm/ảnh từ Warehouse/Core read-model.
- `Đã sửa`: message normalize lưu `order_id/order_sn/product_ids`; UI render card đơn trong từng message và ảnh/video/file thật từ attachment; conversation dài dùng flex layout để `messageThread` cuộn còn ô chat luôn nằm trong viewport.
- `Shop có API`: Shopee `170044686/chihuy1984` chạy Open Platform/bridge -> Chat Core D1 -> Order/Product Core read-model -> UI. Không dùng Seller Center/browser fallback cho shop API.
- `Shop không API`: giữ `manual_import/browser_helper` riêng, không gắn nhãn API nếu chưa có token/quyền.
- `Deploy`: Worker chính `huyvan-worker-api` version `624584d2-ae6e-470b-9cc7-b781b94f98f7`; Static `shophuyvan-analytics` version `85104fd5-2abf-45d2-9c74-b76ef6a33cd2`.
- `Production readback`: sync shop `170044686` đọc `45` hội thoại và `138` tin; message `[Đơn hàng] 260526EBHR5T4A` có `order_id`; Core trả `Đã giao · 47.500đ`; attachment ảnh render thật trên UI.
- `Production UI`: mobile/tablet/desktop pass, không tràn ngang, không HTTP/console error, ô chat hiển thị được ở hội thoại dài.

### 2026-05-26 - Shopee Chat current conversation list endpoint fix

- `Đã tra trực tiếp`: Shopee Open Platform website/API doc endpoint; FAQ Customer Service App Type xác nhận SellerChat endpoints tồn tại: `get_conversation_list`, `get_message`, `get_one_conversation`, `send_message`, `read_conversation`, `upload_image`, `webchat_push`. Chi tiết `/doc/api` hiện khóa bởi login/quyền `error_auth`, không ghi `endpoint_not_available`.
- `Đã dùng`: `/api/v2/sellerchat/get_conversation_list` với `direction=older&type=all`, `/api/v2/sellerchat/get_message`, `/api/v2/sellerchat/get_one_conversation`, read-only diagnostic `/api/v2/push/get_lost_push_message`.
- `Đã sửa`: bridge trước đó dùng `direction=latest&type=all` nên Shopee trả list cũ năm 2024. Probe production chứng minh `direction=older&type=all` khớp Seller Center hiện tại và thấy các khách `kalot4991`, `tdminh82`, `phamdathao273`, `anhvunhi1995`, `tiendatfarm`, `quochuy190195`, `tien193200`, `shop24_7`, `thuthai984`, `ri.decor`.
- `Shop có API`: Shopee `170044686/chihuy1984` đi Open Platform/bridge, lưu Chat Core D1; không dùng Seller Center/browser fallback.
- `Shop không API`: browser-helper/manual vẫn là luồng riêng; đã bổ sung lưu `customer_name` cho helper để không hiển thị mã nếu helper có tên thật.
- `Deploy`: Worker chính `77fa391a-2613-4130-b918-730382eb4fc7`; Chat Worker `0caf8953-945d-4f56-bc23-7e55fb64d8b8`.
- `Readback`: production sync `170044686` kéo `45` hội thoại, đọc `138` tin; UI production mobile/tablet/desktop hiển thị `kalot4991 | GIA DỤNG HUY VÂN`, `phamdathao273`, `anhvunhi1995`, `tiendatfarm`, không HTTP/console error.

### 2026-05-26 - Chat Core Shopee lost-push/paging readback

- `Đã dùng`: Shopee SellerChat `/api/v2/sellerchat/get_conversation_list`, `/api/v2/sellerchat/get_one_conversation`, `/api/v2/sellerchat/get_message`.
- `Đã kiểm thêm`: Shopee Push `/api/v2/push/get_lost_push_message` ở chế độ read-only; không gọi `/api/v2/push/confirm_consumed_lost_push_message` để tránh consume queue khi chưa cần.
- `Đã sửa`: Worker bridge thêm paging/dedupe cho `get_message`, thêm lost-push merge, và sửa `/api/webhooks/events` bị crash do thiếu helper `ensureColumn`.
- `Shop có API`: Shopee `170044686` chạy Open Platform/bridge, lưu Chat Core D1; không chuyển sang Seller Center fallback.
- `Readback`: target `296431470344582725 / 69018330` có `customer_name=tdminh82`, `shop_display_name=GIA DỤNG HUY VÂN`, `sync_health=ok`, không còn HTTP 501/503.
- `Còn mở`: target chỉ có 8 tin unique ngày `2026-05-16`, `2026-05-18`, `2026-05-26`; không có `2026-05-22..2026-05-25` trong `get_message`, lost-push, hoặc webhook recent. `webchat_push` gần nhất ghi nhận `2026-05-06 14:05:21`.
- `Deploy`: Worker chính `a01e7e9a-4bc2-4977-8bd8-e1dd1cf3c137`; Chat Worker `c95493cf-8836-42bf-81ac-8ab9b135a335`; static UI không đổi.

### 2026-05-26 - Chat Core Shopee `get_one_conversation` + tên khách thật

- `Đã dùng`: Shopee SellerChat `/api/v2/sellerchat/get_conversation_list`, `/api/v2/sellerchat/get_one_conversation`, `/api/v2/sellerchat/get_message`.
- `Đã sửa`: bridge ưu tiên tên khách từ field chính thức `to_name/buyer_name`; production conversation `296431470344582725` readback `customer_id=69018330`, `customer_name=tdminh82`, `shop_display_name=GIA DỤNG HUY VÂN`, `last_message_text=DẠ`.
- `Shop có API`: Shopee `170044686` và các shop API tiếp tục đi polling API/bridge, lưu Chat Core D1; không chạy Seller Center fallback.
- `Giới hạn vận hành`: batch sync giới hạn an toàn để không vượt subrequest Cloudflare; topbar production đã quét 4 shop, 181 hội thoại, đọc 398 tin, lưu 0 tin mới, không console/http error.
- `Còn mở`: đúng conversation `296431470344582725` chỉ trả message ngày `2026-05-16`, `2026-05-18`, `2026-05-26`; chưa thấy message `2026-05-22..2026-05-25` trong `get_message`. Cần kiểm tiếp webhook/lost-push/cursor nếu Seller Center chứng minh có tin cùng conversation.
- `Deploy`: Worker chính `9f3997fc-48a0-4d96-b98e-df0dcfee59a0`; Chat Worker `95ce6a84-dca8-4a61-8fc9-219dddc085e3`.

### 2026-05-26 - Chat Core Shopee sync target + multi-shop

- `Đã dùng`: Shopee SellerChat official bridge `POST /api/chat/sync` -> Worker API bridge -> `/api/v2/sellerchat/get_conversation_list` + `/api/v2/sellerchat/get_message`.
- `Đã sửa`: target sync theo `platform_conversation_id` Shopee thật; không còn bỏ qua active conversation khi hội thoại không nằm trong batch list.
- `Đã sửa UI`: topbar `Sync ngay` quét từng shop API trong kênh đang mở; active thread diagnostic vẫn sync riêng hội thoại.
- `Shop có API`: Shopee `166563639`, `170044686`, `178449745` dùng polling API/bridge, lưu vào Chat Core D1 và UI đọc read-model.
- `Shop không API`: `khogiadungcona` vẫn `manual_import/shop_api_not_configured`, không dùng Seller Center fallback.
- `Production`: Worker `huyvan-worker-api` version `00f9cb9d-3275-4590-b13b-32395ab2a63a`; Chat Worker `shophuyvan-chat-api` version `397b332d-83c8-492f-8aed-d12ffc10ab06`; Static `shophuyvan-analytics` version `63bb113c-aa79-4508-8c4d-94aa439f243f`.
- `Readback`: conversation `69018330 / 296431470344582725` target pulled `8` messages, saved `4`, `sync_health=ok`, không còn `HTTP 501/503`. SellerChat/Core chưa trả messages `2026-05-22` đến `2026-05-25` trong đúng conversation này.
- `Còn mở`: cần bổ sung schema/cursor hoặc webhook `webchat_push` nếu SellerChat list/message tiếp tục trả conversation mới nhưng không trả nội dung message.

### 2026-05-26 - Chat Core Shopee sync/realtime UI

- `Follow-up production`: sửa stale error badge `Shopee bridge sync HTTP 503` trên conversation `172077`. Sau shop-level sync thành công, Chat Core clear lỗi cũ cho các conversation cùng `channel + shop_id`; production readback row này đã về `sync_health=ok`.
- `Deploy follow-up`: Chat Worker `shophuyvan-chat-api` version `1ef3e6a2-b94e-4cc3-b583-8f21659e7e14`.

- `Đã dùng`: Shopee SellerChat qua bridge chính thức `POST /api/chat/sync` -> Worker API bridge -> `/api/v2/sellerchat/get_conversation_list` và `/api/v2/sellerchat/get_message`; Chat UI production `https://shophuyvan-analytics.nghiemchihuy.workers.dev/pages/chat-cskh.html`.
- `Shop có API`: Shopee API shop id `166563639`, `170044686`, `178449745` sync bằng polling API/bridge, lưu Chat Core D1 và UI chỉ đọc lại read-model. Production probe `166563639` kéo 50 hội thoại, đọc 147 tin, lưu mới 4 tin trong lần kiểm force history.
- `Shop không API`: Shopee `khogiadungcona` giữ `manual_import`; sync trả `200/manual_required` với `shop_api_not_configured`, không dùng Seller Center fallback khi chưa có token/API shop id.
- `Endpoint thiếu quyền`: chưa phát hiện thiếu quyền mới trong lượt này. Nếu bridge/SellerChat trả permission/token lỗi, Chat Core ghi `api_permission_missing` hoặc `token_scope_missing`, không đổi sang helper cho shop có API.
- `Production`: Chat Worker `shophuyvan-chat-api` version `5443eb15-ed1e-4876-a07e-00326b7c65be`; static `shophuyvan-analytics` version `1dc584e3-12e0-4861-8a1f-01c09b725095`.
- `Đã kiểm production`: Chrome profile `E:\codex-chrome-profiles\shophuyvan-test`, click `Shopee -> Sync` trả `POST /api/chat/sync` status `200`, không `HTTP 501`, không abort/CORS; UI hiển thị tên shop `GIA DỤNG HUY VÂN` từ Shop Core/read-model. Responsive desktop/tablet/mobile pass.

### 2026-05-26 - Khuyến mãi sàn UI mới theo Promotion Core

- `Đã xong`: giao diện Khuyến mãi sàn đã bỏ UI/IIFE cũ và chuyển sang module mới đọc Promotion Core/read-model; không phát sinh nguồn dữ liệu thứ hai và không xoá dữ liệu lịch sử Core.
- `Shop có API`: Shopee `chihuy1984`, `chihuy2309`, `phambich2312` tiếp tục dùng Promotion Core/Open Platform thông qua Worker API; Lazada `kinhdoanhonlinegiasoc@gmail.com` tiếp tục hiển thị module Lazada theo read-model/capability, chưa fake live-write nếu thiếu adapter/readback.
- `Shop không API`: không dùng Seller Center fallback trong lượt UI này; picker Flash Sale chỉ lấy ứng viên SKU từ Promotion Core đã đồng bộ, không tự tạo dữ liệu sàn.
- `Endpoint đã dùng`: `GET /api/discounts/core`, `GET /api/discounts/promotion-module-read-model`, `GET/POST /api/discounts/automation/settings`, `POST /api/discounts/automation/run-now`, `POST /api/discounts/cleanup/action`, `GET /api/discounts/promotion-sku-detail`.
- `Endpoint live-write`: không thêm endpoint mới. Các route write hiện có vẫn yêu cầu `execute:true`, capability, mapping shop/item/model/SKU/promotion_id, action log và readback verified trước khi UI báo thành công.
- `Production`: static `shophuyvan-analytics` version `30de78d2-d9cc-4949-8dd0-11f453465446`; Chrome profile `E:\codex-chrome-profiles\shophuyvan-test` đã kiểm 8 module, Flash Sale picker/lưu/readback, cleanup và responsive desktop/tablet/mobile.
- `Còn mở`: chưa kết luận live-write đủ 8 module; Lazada Voucher/Freeship/Flexicombo vẫn chỉ hiện action khi capability/readback cho phép. Nếu thiếu quyền/token sẽ ghi `token_scope_missing`/`api_permission_missing`, không fallback Seller Center khi shop có API.

### 2026-05-26 - Chỉnh Flash Sale/Cleanup theo phản hồi vận hành

- Khuyến mãi sàn không còn chip/tab riêng `Shopee Flash Sale tự động`; luật tự động được gộp vào đúng module `Shopee Flash Sale` hiện có để tránh trùng luồng và tránh code/caller thừa.
- Switch ADS/Flash Sale đổi sang công tắc 96x40 có chữ Bật/Tắt rõ, trạng thái bật màu xanh, tắt màu xám, disabled nhìn rõ.
- Dọn chương trình cũ đã nối route `POST /api/discounts/cleanup/action`: Shopee Discount/Voucher/Bundle/Add-On/Shop Flash Sale dùng endpoint delete/end chính thức qua Core action hiện có; Lazada Voucher/Freeshipping/Flexicombo dùng endpoint deactivate chính thức. Backend luôn trả `local_delete=false` và chỉ coi thành công khi readback từ sàn khớp.
- Endpoint đã đối chiếu từ Open Platform/local raw docs: Shopee `delete_shop_flash_sale`, `delete_shop_flash_sale_items`, `delete_bundle_deal`, `delete_bundle_deal_item`, `delete_add_on_deal`, `delete_add_on_deal_main_item`, `delete_add_on_deal_sub_item`, `delete_voucher`, `end_voucher`, Discount delete/end; Lazada `/promotion/voucher/deactivate`, `/promotion/voucher/product/sku/remove`, `/promotion/freeshipping/deactivate`, `/promotion/freeshipping/product/sku/remove`, `/promotion/flexicombo/deactivate`, `/promotion/flexicombo/products/delete`.
- Test local đã pass: `node --check` cho Promotions UI/Discount route/Promotion Core, `node scripts/test-ads-operations-ui.mjs`, `node scripts/test-ui-design-system-guard.mjs`, `npm --prefix apps/fe run lint --if-present`, `npm --prefix apps/fe run build --if-present`, `npm --prefix apps/worker-api test --if-present`, `git diff --check` chỉ còn cảnh báo CRLF sẵn.
- Đã deploy production: Worker `huyvan-worker-api` version `0e5d80af-67b7-4142-bb8c-b456cc03a9f5`; Static `shophuyvan-analytics` version `d428d217-7656-4842-b012-881d2f0e73cf`; Cloudflare account `efe50fab1dd644088d681fb14a4838ae`.
- Kiểm production bằng Chrome profile `E:\codex-chrome-profiles\shophuyvan-test`: ADS chỉ còn 4 tab, không còn `Đồng bộ dữ liệu`/`Cài đặt`; mở `Luật tự động ADS`, thêm khung giờ, switch mới hiển thị Bật/Tắt rõ; Khuyến mãi chỉ còn 1 chip `Shopee Flash Sale`, trong module có `Luật tự động Flash Sale`, không còn chip `Shopee Flash Sale tự động`; Dọn chương trình cũ hiện nút `Kết thúc trên sàn`/`Xóa trên sàn` theo endpoint, route dry-run trả endpoint `/api/v2/shop_flash_sale/delete_shop_flash_sale`, `local_delete=false`. Live-write sample với Flash Sale đã kết thúc `144639596756993` trả Shopee `shop_flash_sale_param_error`; đối chiếu raw doc `delete_shop_flash_sale` thấy rule chính thức `cannot delete ongoing and expired shop flash sale`, nên backend/UI đã chặn bằng `endpoint_not_supported_for_expired_flash_sale` và chỉ cho ẩn khỏi danh sách đang hoạt động, không xoá local giả.
- Responsive production đã kiểm desktop `1366x900`, tablet `820x1180`, mobile `390x844`, không tràn ngang. Evidence: `tmp-verification/ads-promo-final-check.json`, `tmp-verification/ads-promo-final-focused-check.json`, screenshots `ads-final-*.png`, `promo-final-*.png`.

### 2026-05-26 - ADS automation cron/live-write executor

- `Shopee ADS`: automation executor dùng endpoint chính thức `/api/v2/ads/edit_manual_product_ads` cho manual product ads và `/api/v2/ads/edit_auto_product_ads` cho auto product ads; readback bắt buộc qua `get_product_level_campaign_setting_info`. Trạng thái pass chỉ được ghi khi readback khớp budget/status sau ghi.
- `Shopee ADS capability`: action automation map vào capability `change_budget`, `pause`, `resume`; nếu `ads_write_capabilities.allowed=false` hoặc thiếu mapping campaign/shop thì ghi `capability_blocked`, không gửi API.
- `Lazada ADS`: lượt này chưa mở executor live-write tự động; log automation ghi `platform_not_supported_yet`, không fake thành công. Khi mở phải nối endpoint Sponsored Solutions tương ứng và readback riêng.
- `TikTok ADS`: chỉ đọc, automation ghi `read_only_platform`, không live-write.
- `Safety`: `dry_run_mode` mặc định bật, `max_campaigns_per_run`, cap tăng/giảm budget, `require_admin_confirm_above_pct`, `emergency_stop`, action log và readback là bắt buộc trước khi ghi sàn.
- `Production pass`: Shopee `chihuy1984 / campaign_id=164107991` automation live-write `pause` qua `/api/v2/ads/edit_manual_product_ads` đã readback success bằng `get_product_level_campaign_setting_info`; đã revert `resume` và readback về `campaign_status=ongoing`.

﻿# Checklist Tổng Thể Endpoint Marketplace

## ADS UI clean decision table và endpoint xoá/kết thúc 2026-05-25

- `Đã kiểm production`: ADS UI chuyển sang bảng/card quyết định gọn: bỏ icon `?` đại trà ở màn chính, cột số căn phải/tabular, badge chỉ nói vấn đề thật, action tách riêng thành nút `Xem`, `Tạm dừng`, `Giảm ngân sách`, `Giữ ADS`, `Bật lại`. Static production version `e5f81812-6888-44f0-a687-3b1c379d8be0`; desktop/tablet/mobile ADS không tràn ngang và không còn `Giảm 30%`.
- `Endpoint rule`: không xoá dữ liệu lịch sử khỏi Core. Campaign/chương trình đã kết thúc chỉ được ẩn bằng filter/tab `Đã kết thúc` nếu chưa có delete/archive chính thức hoặc chưa có preview/confirm/readback.
- `Shopee ADS`: reference Open Platform local có nhóm ADS product campaign write qua `/api/v2/ads/edit_manual_product_ads`, `/api/v2/ads/edit_auto_product_ads`, keyword write qua `/api/v2/ads/edit_manual_product_ad_keywords`; production đã pass pause/resume manual product ads bằng `edit_manual_product_ads` và readback `get_product_level_campaign_setting_info`. Delete/tắt vĩnh viễn chưa mở UI vì cần sample an toàn, confirm phá huỷ và readback riêng; không fake xoá local.
- `Lazada ADS`: reference Lazada Ads có `/sponsor/solutions/campaign/deleteCampaign` và `/sponsor/solutions/adgroup/deleteAdgroupBatch`, ngoài update campaign/adgroup hiện có. OMS chưa có adapter delete + readback + sample an toàn nên chưa được tính live-write pass; phải làm preview/admin confirm/action log/readback trước khi mở nút `Xoá trên sàn`.
- `Shopee Promotion`: reference Open Platform có delete/end cho Discount, Voucher, Bundle, Add-On và delete cho Shop Flash Sale item/program; Shopee Discount update live-write đã pass trước đó, Flash Sale no-change update đã pass. Delete/end chưa mở đại trà nếu thiếu quyền app, sample chưa expired hoặc readback/revert an toàn.
- `Lazada Promotion`: reference Lazada có activate/deactivate/update cho Voucher/Freeshipping/Flexicombo và product add/remove/delete tuỳ module; hiện Khuyến mãi sàn vẫn read-only với Lazada module vì thiếu adapter payload live-write an toàn và readback production.
- `Blocker hiện tại`: có endpoint xoá/kết thúc ở nhiều module nhưng chưa đủ điều kiện live destructive write trong lượt UI này nếu thiếu sample an toàn và admin confirm/readback. Không xoá local để giả vờ đã xoá trên sàn.

## ADS/Promotion user help annotations 2026-05-25

- `Đã thay đổi bởi rule mới`: mục này là lịch sử lượt trước. ADS main UI hiện không được giữ icon `?` đại trà; chú thích nếu cần phải nằm trong drawer/detail và không làm rối bảng quyết định.
- `Đã xong`: ADS và Khuyến mãi sàn có icon chú thích cạnh KPI, trạng thái, đề xuất, cột bảng và hành động quan trọng; popover/bottom sheet giải thích ý nghĩa, tốt/xấu và việc cần làm.
- `Đã xong`: ADS có chú thích cho ROAS, ACOS, chi ADS, doanh thu ADS, lãi sau ADS, thiếu giá vốn, tồn kho, đề xuất, ngân sách ngày, tạm dừng/bật lại/tắt/đổi ngân sách/đổi ROAS, xem trước và áp dụng.
- `Đã xong`: Khuyến mãi sàn có chú thích cho giá gốc, giá khuyến mãi, phần trăm giảm, tồn kho, doanh thu từ khuyến mãi, sắp hết hàng, chỉnh giá, tạm dừng chương trình và đồng bộ khuyến mãi.
- `Endpoint rule`: không phát sinh endpoint Shopee/Lazada mới. Đây là thay đổi UI giải thích dữ liệu đã có từ read-model hiện tại, không thêm nguồn dữ liệu hay live-write mới.
- `Đã kiểm production`: Chrome profile `E:\codex-chrome-profiles\shophuyvan-test` bấm ROAS, ACOS, Thiếu giá vốn, Đề xuất, Ngân sách ngày, Tạm dừng chiến dịch, Đồng bộ khuyến mãi, Giá khuyến mãi, Tồn kho; tất cả mở đúng chú thích, click ngoài/ESC đóng được.
- `Deploy`: Static `shophuyvan-analytics` version `4296015e-1102-4bc1-b39e-87e94ab44053`; Worker không đổi.
- `Responsive`: desktop `1366x900`, tablet `820x1180`, mobile `390x844` đều không tràn ngang, không request failed, không Console error, không text kỹ thuật trong popover.

## ADS adjust campaign card read-model 2026-05-25

- `Đã xong`: tab `Điều chỉnh ADS` bước `Chọn chiến dịch` hiển thị lại tên sản phẩm, SKU, shop, Mã ADS và số liệu vận hành thay vì card chỉ còn `0đ/ROAS` khó nhận diện.
- `Đã xong`: frontend merge catalog campaign API với ADS dashboard/Product Core read-model, giữ ảnh nếu API có nhưng không làm mất `product_name/product_sku/spend/revenue/roas/current_cost/available_stock`.
- `Endpoint rule`: không phát sinh endpoint Shopee/Lazada mới. Route production vẫn là `GET /api/ads/dashboard` và `GET /api/ads/campaign-guard/campaigns`; lỗi thuộc merge read-model/UI, không phải thiếu Open Platform endpoint.
- `Đã kiểm production`: `/api/ads/dashboard`, `/api/ads/campaign-guard/campaigns`, `/api/ads/campaign-guard/overview` đều `200`; card đầu có SKU `K54HOAANHDAO24CM`, chi ADS `30.383đ`, doanh thu `265.252đ`, ROAS `8,73`, giá vốn `14.145đ`, tồn `131`.
- `Deploy`: Static `shophuyvan-analytics` version `26b2fae5-1e33-4438-aaa5-b1bfd9fb18e1`; Worker không đổi, giữ `7d33375e-705b-4d0b-a12d-fe968ea95cdf`.
- `Responsive`: desktop `1366x900`, tablet `820x1180`, mobile `390x844` đều không tràn ngang, không `Failed to fetch`, không Console fetch error.

## ADS Product Core cost readback 2026-05-25

- `Đã xong`: sửa tab `Sản phẩm cần xử lý` bị nền trắng khi hover do CSS bảng global đè dark theme; ADS table có hover riêng nền xanh đậm, chữ sáng.
- `Đã xong`: sửa giá vốn ADS thiếu hàng loạt. ADS snapshot không có `product_sku`, nên backend nối bằng `raw_data.setting_summary.item_id_list` sang `product_variations.platform_item_id`, sau đó đọc `products.cost_real/cost_invoice` và `sku_current_cost_read_model.current_cost` nếu Warehouse Core đã có.
- `Endpoint rule`: không phát sinh endpoint Shopee/Lazada mới. Đây là lỗi mapping Core nội bộ từ ADS snapshot sang Product/Warehouse Core, không phải thiếu Open Platform endpoint.
- `Đã kiểm production`: `/api/ads/dashboard` trả `missing_cost=0`; sample `K54HOAANHDAO24CM` có tồn `131`, giá vốn `14.145đ`; `HV999K241300S` có giá vốn `24.000đ`; `1_DUI_DEN_428A_K64` đọc source `warehouse_purchase_core`.
- `Deploy`: Worker `huyvan-worker-api` version `7d33375e-705b-4d0b-a12d-fe968ea95cdf`; Static `shophuyvan-analytics` version `4ccb0121-e711-4fe7-93e6-6b3492741019`.
- `Responsive`: desktop `1366x900`, tablet `820x1180`, mobile `390x844` đều không tràn ngang, không row trắng, không `Failed to fetch`.

## ADS Failed to fetch Worker 1102 2026-05-25

- `Đã xong`: xác định lỗi production `Failed to fetch` trên ADS là `GET /api/ads/dashboard` bị Cloudflare Worker `503/1102 Worker exceeded resource limits`; browser báo CORS `MissingAllowOriginHeader` vì response lỗi HTML của Cloudflare không có CORS. Auth `/api/admin/auth/me` `200`, không phải 404, không phải mixed static/worker deploy.
- `Đã xong`: `/api/ads/dashboard` mặc định chỉ tải dữ liệu ADS snapshot nhẹ, không gọi live account status Shopee và không chạy enrichment Product/Warehouse/Finance Core nặng khi mở màn hình. Dữ liệu thiếu giữ `null/missing`, không vá số liệu ở UI.
- `Đã xong`: UI ADS không còn hiện raw `Failed to fetch`; lỗi network được đổi thành hướng dẫn người dùng bấm `Làm mới` hoặc đăng nhập lại, trong khi backend vẫn trả `error_code` khi lỗi nằm trong Worker route.
- `Endpoint rule`: không phát sinh endpoint Shopee/Lazada mới. Các route production đã kiểm là `GET /api/ads/dashboard`, `GET /api/ads/campaign-guard/overview`, `GET /api/ads/campaign-guard/campaigns`, `POST /api/ads/sync-campaigns`. Vấn đề là resource limit của route tổng hợp, không phải thiếu endpoint Open Platform.
- `Đã kiểm production`: Worker `huyvan-worker-api` version `d35931bf-b87d-4d72-813d-8fc1042b1005`; Static `shophuyvan-analytics` version `3ea2c63d-c14f-4141-b40f-d80ddecdc832`; Chrome profile `E:\codex-chrome-profiles\shophuyvan-test` reload ADS, mở từng tab, bấm `Kéo ADS` thấy `Đã quét 432`, `Đã cập nhật 432`, `Lỗi 0`, reload lại đều không còn `Failed to fetch`.
- `Responsive`: desktop `1366x900`, tablet `820x1180`, mobile `390x844` không tràn ngang và không lỗi ADS load.
- `Còn mở`: enrichment giá vốn/tồn/lãi theo SKU nên chuyển sang job/read-model nền hoặc endpoint chi tiết nếu cần dữ liệu đầy đủ mà không làm route mở màn hình quá tải.

## ADS current-day UI/Core readback 2026-05-25

- `Đã xong`: ADS và Khuyến mãi sàn có nút quay về trang chính `/`; ADS mặc định đọc ngày hiện tại 2026-05-25 và Worker cron kéo ADS ngày hiện tại mỗi 5 phút cho Shopee/Lazada.
- `Đã xong`: Dashboard ADS nối lại Product/Warehouse Core để trả ảnh, tên sản phẩm, SKU, tồn, giá vốn. Giá vốn ưu tiên `sku_current_cost_read_model.current_cost`; nếu Warehouse chưa có lô nhập thì dùng Product Core `products.cost_real/cost_invoice` với nguồn `product_master_reference_cost`.
- `Đã xong`: Tab `Điều chỉnh ADS` hiển thị campaign bằng card có ảnh, ưu tiên campaign đang chạy/có chi tiêu trong ngày; nhãn ngân sách ghi rõ `Ngân sách ngày`; trạng thái bật/tắt dùng switch.
- `Đã xong`: Worker strip raw payload khỏi `/api/ads/dashboard`, thêm no-store/CORS ổn định; frontend bỏ auth header cho GET public read ADS/Discount để tránh preflight cache lỗi.
- `Endpoint rule`: không phát sinh endpoint Shopee/Lazada mới trong hotfix này. Luồng dùng endpoint ADS hiện có đã nối trước đó; vấn đề là read-model/CORS/cache/UI và Core enrichment. Nếu lượt sau thiếu field ghi thật cho Shopee/Lazada ADS thì vẫn phải kiểm Open Platform chính thức trước khi kết luận blocker.
- `Đã kiểm production`: Worker `huyvan-worker-api` version `41acdcea-d938-43b9-bcc6-87b140e626a6`; Static `shophuyvan-analytics` version `9e85ba51-f13b-4c8a-9e40-f9063e7d5f22`; Chrome profile `E:\codex-chrome-profiles\shophuyvan-test` mở ADS/Khuyến mãi sàn, desktop/tablet/mobile không tràn ngang. Tab `Đồng bộ dữ liệu` bấm `Kéo ADS` pass: `Đã quét 432`, `Đã cập nhật 432`, `Lỗi 0`.
- `Còn mở`: 4 dòng ADS còn `missing_cost` là thiếu mapping/giá trong Core thật, không được vá ở UI. Cần bổ sung Product/Warehouse mapping hoặc lô nhập nếu muốn hết trạng thái thiếu giá vốn.

## ADS và Khuyến mãi sàn tách nghiệp vụ 2026-05-24

- `Hotfix/live-write 2026-05-25`: Khuyến mãi sàn không còn action fail hàng loạt do frontend tự chặn. Shopee Voucher/Bundle/Add-On/Flash Sale đã gọi route `/api/discounts/shopee/promotion-action` với `use_cached_payload=true`; Worker bật `SHOPEE_LIVE_WRITE_ENABLED=true`; UI không render payload/endpoint/request id.
- `Đã live-write pass 2026-05-25`: Shopee Flash Sale sample `chihuy1984 / flash_sale_id=144307500154880` action `update_shop_flash_sale`, readback `get_shop_flash_sale` verified `true`, no-change nên không cần revert.
- `Blocker thật 2026-05-25`: Shopee Voucher sample bị Shopee chặn `no edit permission for the voucher, shopee backend created voucher`; Shopee Bundle/Add-On sample production hiện đều `expired` nên Shopee không cho sửa. Lazada Voucher/Freeship/Flexicombo vẫn read-only vì chưa có adapter payload live-write an toàn dù endpoint LazOP đã có.
- `Đã kiểm production 2026-05-25`: Static `54422a1e-b3f3-48b6-a763-cf47623c35ba`, Worker `0c01104b-ca57-4b15-ac28-933464d9fdd7`; 8 module mở được, desktop/tablet/mobile không tràn ngang, nhật ký thao tác hiển thị dữ liệu từ `marketplace_discount_actions`.

- `Đã xong`: ADS không còn tab quản lý module khuyến mãi. Màn ADS chỉ còn `Tổng quan`, `Sản phẩm cần xử lý`, `Điều chỉnh ADS`, `Đồng bộ dữ liệu`, `Nhật ký thao tác`, `Cài đặt`; khối khuyến mãi trong ADS chỉ là tham chiếu ra quyết định quảng cáo.
- `Đã xong`: Khuyến mãi sàn tách sang `apps/fe/pages/promotions.html`, đủ 8 module bắt buộc: Shopee Discount, Shopee Voucher, Shopee Bundle, Shopee Add-On, Shopee Flash Sale, Lazada Voucher, Lazada Freeship, Lazada Flexicombo.
- `Đã xong`: Promotion module read-model `GET /api/discounts/promotion-module-read-model` trả program/item/capability người dùng từ các bảng Promotion Core hiện có; raw payload/endpoint/request id giữ backend, không render UI.
- `Đã xong`: Tab `Điều chỉnh ADS` không dùng native select dài cho campaign; đã đổi sang search + card/list campaign. UI ADS/Promotion không render `endpoint`, `payload`, `request_id`, `Core`, `cache`, `guard`, `JSON`, `route`.
- `Đã kiểm production`: Worker `huyvan-worker-api` version `a637c316-4d53-4198-b20d-ae4f97fc9bf1`; Static `shophuyvan-analytics` version `8d8cd111-f332-41f8-ba3e-2753f16963e5`; Chrome profile `E:\codex-chrome-profiles\shophuyvan-test` mở ADS/Khuyến mãi sàn, click từng tab/module, pass desktop/tablet/mobile.
- `Còn mở`: chưa được ghi hoàn thành live-write đủ 8 module. Shopee Discount có baseline live-write đã pass; các module còn lại chỉ được nâng trạng thái sau khi có endpoint/quyền app chính thức, preview, admin confirm, live-write sample, readback khớp và revert khi cần.
- `Hotfix production 2026-05-24`: sửa lỗi Khuyến mãi sàn báo load fail khi bấm action; `GET /api/discounts/promotion-module-read-model` pass đủ 8 module, `POST /api/discounts/shopee/sync` pass từ UI và route lỗi trả JSON/CORS.
- `Live-write production 2026-05-24`: Shopee Discount pass trực tiếp từ màn Khuyến mãi sàn với sample no-change an toàn `phambich2312 / discount_id=913787453636608 / item_id=25068730875 / model_id=365375191421 / 39.000đ`; endpoint `/api/v2/discount/update_discount_item`, readback verified, Core writeback `success/synced`.
- `Còn mở`: Shopee Voucher, Bundle, Add-On, Flash Sale và Lazada Voucher/Freeship/Flexicombo đã có path chính thức/allowlist tham chiếu nhưng chưa được tính live-write pass trên màn Khuyến mãi sàn vì chưa có adapter payload + quyền app + sample/readback/revert riêng.

## ADS Core/UI cleanup và live-write readback 2026-05-24

- `Đã xong`: tạo/cập nhật Skill `shophuyvan-ads-core-guard` và `shophuyvan-ui-end-user-guard`; `AGENTS.md` đã thêm rule dùng hai skill này khi sửa ADS/UI.
- `Đã xong`: trang `ADS quảng cáo` chỉ còn 7 tab người vận hành: `Tổng quan`, `Sản phẩm cần xử lý`, `Khuyến mãi & ADS`, `Điều chỉnh ADS`, `Đồng bộ dữ liệu`, `Nhật ký thao tác`, `Cài đặt`.
- `Đã xong`: xoá các module frontend ADS cũ khỏi `apps/fe/js/dashboard/ads`; loader chỉ nạp `ads-end-user-ui.js`. CSS ADS thay bằng bản mobile-first mới, không còn khối UI kỹ thuật cũ.
- `Đã xong`: ADS Core schema gồm `ads_campaigns`, `ads_adgroups`, `ads_product_links`, `ads_daily_metrics`, `ads_decision_read_model`, `ads_write_capabilities`, `ads_action_logs`.
- `Đã xong`: capability ADS và action log ghi vào bảng Core mới; live-write flow bắt buộc preview, admin confirm, allowlist/capability và readback trước khi UI báo thành công.
- `Đã đối chiếu endpoint`: Shopee ADS read/write từ Open Platform reference gồm balance/toggle/performance/campaign setting, manual/auto product ads create/edit và keyword edit.
- `Đã đối chiếu endpoint`: Lazada Ads API gồm campaign/adgroup search/update, account sign info, wallet/report/keyword/product endpoints; campaign/adgroup write hiện có readback bắt buộc.
- `Đã kiểm production`: Worker `huyvan-worker-api` version `61f2a180-5415-4ff1-8506-6ddc1a2f90c0`, Static `shophuyvan-analytics` version `39011766-de16-4607-820e-c2255b2d6ca4`; Chrome profile `E:\codex-chrome-profiles\shophuyvan-test` mở ADS, kiểm từng tab, bấm `Kéo ADS`, preview và apply live-write Shopee sample.
- `Đã live-write`: Shopee shop `chihuy1984`, campaign `164859807`, action `pause` qua `/api/v2/ads/edit_manual_product_ads`, readback `/api/v2/ads/get_product_level_campaign_setting_info` pass; revert `resume` qua cùng endpoint, readback pass.
- `Đã kiểm lại sau revert`: campaign `164859807` đang `ongoing`, `campaign_budget=0`, `roas_target=15`; preview production mới không còn gửi `budget` thừa khi action là `pause`.
- `Còn mở`: responsive tablet/mobile production bằng đúng profile thật chưa nghiệm thu vì công cụ resize profile Chrome không điều khiển được; không dùng kết quả Chrome tách profile do bị login wall.

## Purchase/Warehouse Core giá vốn theo lô 2026-05-24

- Lượt này không phát sinh endpoint Shopee/Lazada mới. Nguồn dữ liệu là Product Core nội bộ + Purchase/Warehouse Core; nếu sau này thiếu field marketplace cho SKU/sản phẩm thì vẫn giữ rule kiểm Shopee/Lazada Open Platform trước khi fallback.
- Trang nhập hàng chính ngạch đã nối Product Core và Warehouse Core để phục vụ giá vốn hiện tại cho OMS/Product Master/Promotion guard; không tạo nguồn giá vốn thứ hai ở UI.
- Production đã deploy Worker `4dc21f7f-e738-4fd4-b003-0ae1f39c120a`, static `fd5f6bd6-6cbd-4e10-aa21-3578641ceb45`. Readback/preview/export/responsive pass; confirm ghi thật chờ lô nhập an toàn.

## Promotion Core và giá khuyến mại 2026-05-24

- `Đã xong`: R2 upload helper cho bot local đã có đường kiểm thật qua `/api/upload-url` và `/api/upload`; Worker secret `SHV_LOCAL_RUNNER_TOKEN` đã đặt trên Cloudflare, không lưu token vào repo.
- `Đã xong`: Product Master bulk giá KM có “Chọn tất cả SKU đang lọc”, áp dụng phần trăm cho toàn bộ SKU đã chọn thay vì chỉ dòng đang render.
- `Đã xong`: TikTok Seller Center promotion scraper đọc cột `Giá ưu đãi` từ tab visible Chrome profile `E:\shophuyvan-python-automation\profiles\browser\shophuyvan-runner-tiktok` và ghi về Product/Warehouse Core.
- `Đã kiểm`: TikTok promotion URL `7614469433056216853` scrape 158 dòng, ghi 4 lô, readback 106 variation; Product Master production hiện 129/148 SKU TikTok có giá KM hiện tại.
- `Đã kiểm`: Shopee phambich2312 sync Discount Open Platform read-only qua `/api/v2/discount/get_discount_list` và `/api/v2/discount/get_discount`, lưu 138 item vào Promotion Core.
- `Đã xong`: Shopee API live-write giá KM qua Promotion Core dùng `/api/v2/discount/update_discount_item`, bắt buộc admin confirm, gọi API thật, refetch `/api/v2/discount/get_discount`, ghi `marketplace_discount_items` và `product_variations.discount_price`.
- `Đã kiểm`: Shop `chihuy1984` SKU `400348_100_day_dai_100mm` đã live-write lại `9.900đ`, Shopee request `e3e3e7f3527d2e5c33bdcb8dc0da9100`, readback verified, Product Master UI đọc lại `Giá KM hiện tại=9.900đ`.
- `Đã xong`: Lazada API live-write giá KM qua Promotion Core dùng `/product/price_quantity/update` với XML form payload `SkuId + SalePrice`, refetch `/products/get`, ghi Product Core.
- `Đã kiểm`: Shop Lazada `kinhdoanhonlinegiasoc@gmail.com` SKU `BANGDINH_K205` đã live-write `14.000đ`, request `21013cf717795464481103268`, readback `special_price=14.000`, Core/UI no-change đúng.
- `Đã xong`: Product Master preview không fallback mù theo `item_id` khi SKU/model rõ; dòng Shopee `40TACKE6X32MMK243` resolve đúng `model_id=370230821235`, tránh lệch sang `40TACKE5X30MM`.
- `Đã xong theo rule hết hàng`: Shopee no-API `khogiadungcona` sync giá KM từ Seller Center về Promotion/Product Core đã chạy thật job `2707`, UI Product Master hiển thị giá KM. Upload giá lên Seller Center đã chạy lại job `2715` bằng profile `HuyVan_Bot_Data_khogiadungcona`, headful; Seller Center trả `114/131` và `Chỉ một số sản phẩm thành công`. Report tải từ Seller Center `E:\shophuyvan-runtime\downloads\shopee_khogiadungcona_promo_upload_report_20260524_064325.xlsx` parse `uploaded=114`, `out_of_stock=17`, `failed=0`, gồm `40TACKE6X32MMK243`; runner ghi `completed` vì toàn bộ lỗi là `Hết hàng`.
- `Đã xong`: Product Master hiển thị trạng thái upload từng dòng từ Product/Warehouse Core qua `/api/products/promo-upload-results` và `/api/sync-variations`: badge `Đã up sàn`, `Hết hàng`, `Lỗi upload`, `Bỏ qua`; production đã kiểm desktop/tablet/mobile không tràn ngang.
- `Đã xong`: TikTok no-API `0909128999` upload giá KM lên Seller Center đã pass e2e qua local runner visible/headful profile `E:\shophuyvan-python-automation\profiles\browser\shophuyvan-runner-tiktok`. Job full-shop `2827` dùng Product/Warehouse Core, tải mẫu/ID sản phẩm TikTok, điền `Product Discount.xlsx`, upload lại, bấm `Nhập` và `Đồng ý và đăng`; kết quả `uploaded=73`, `skipped=58` do `Sku_id bị trùng lặp`, `failed=0`, Core/UI hiển thị badge từng dòng. Link chương trình đổi được từ UI Product Master qua `tiktok_promotion_urls`.
- `Đã kiểm`: TikTok sample `40TACKE6X32MMK243` resolve đúng `product_id=1730655569230465831`, `sku_id=1733420946916607783`, giá upload `50.000đ`; sau job `2827` TikTok báo trùng SKU nên UI hiển thị `Bỏ qua`, không phải lỗi ID. SKU có nhiều cặp TikTok ID bị skip `ambiguous_tiktok_sku_id` để tránh up nhầm.

## Profile map automation 2026-05-21

- `Đã xong`: tạo profile Lazada manual trong thư mục chuẩn `E:\shophuyvan-python-automation\profiles\browser\HuyVan_Bot_Data_lazada_kinhdoanhonlinegiasoc`.
- `Đã xong`: profile map chung `oms_python/core/automation_profiles.py` có `source`, chặn API shop khỏi Chrome automation, và cho phép chỉ TikTok `0909128999` + Shopee no-API `khogiadungcona` dùng local browser.
- `Đã kiểm`: CDP audit evidence tại `E:\shophuyvan-runtime\debug-payloads\profile-audit-20260521T053551\profile-audit.json`; Shop1 thấy `phambich2312`, Shop2 thấy `chihuy2309`, Shop3 probable `chihuy1984` nhưng cần login.
- `Chưa làm`: rename Shop1/Shop2/Shop3 vì Chrome còn đang mở với các profile này; không rename khi profile đang bị giữ process.
- `Bị khóa an toàn`: Lazada production vẫn Open Platform/Worker API, không Chrome automation; Shopee API shops vẫn Open Platform/Worker API, không Seller Center fallback.

## Auto kéo đơn/trạng thái 2026-05-20

- `Đã xong`: Shop API (`chihuy1984`, `chihuy2309`, `phambich2312`, Lazada `kinhdoanhonlinegiasoc@gmail.com`) thuộc Worker/Cron/Webhook, không cần Radar Python và không chạy Chrome.
- `Đã xong`: Worker cron API chạy batch nhỏ, không sync Payment live, không gửi push live và không tự queue Chrome fallback cho shop no-API. Lazada cron nền tắt trace sâu để tránh vượt subrequest; lỗi thật vẫn ghi `last_api_sync_error`.
- `Đã xong`: Shop no-API `khogiadungcona` dùng Radar scheduler theo `auto_order_enabled`, `auto_status_enabled`, interval và active window; runtime ghi `last/next/result/error`.
- `Đã xong`: TikTok `0909128999` không loop nền; trạng thái auto phải là paused/reason hoặc one-shot-only, manual one-shot vẫn chạy khi user bấm.
- `Đã xong`: Modal `Tự động kéo đơn` hiển thị scheduler proof thay vì chỉ `Radar đang chạy`, gồm Radar process/PID/heartbeat, last/next order/status, result/error, skipped_reason và shop sẽ chạy.
- `Đã xong`: `Đánh thức ngay` wake scheduler check qua local helper, trả `woke`, `scheduler_running`, `immediate_check_result`; không chỉ ping health.
- `Bị khóa an toàn`: không gửi tin live, không sync Payment live, không dùng profile user cho automation, không taskkill Chrome và không gọi fulfillment/cancel/confirm/arrange.

## Hotfix production OMS/Core 2026-05-20

- Lazada Finance endpoints đã được khóa rule nguồn: `/finance/transaction/details/get`, `/finance/transaction/accountTransactions/query`, `/finance/payout/status/get` là nhóm cần cho settlement/actual income; nếu chưa có dữ liệu/quyền thì OMS ghi thiếu Finance API và chỉ hiện lãi tạm tính.
- Tracking endpoints đọc an toàn: Shopee `/api/v2/logistics/get_tracking_info`; Lazada `/logistic/order/trace`. Nếu API trả timeline/tracking thì row/header OMS không được ghi thiếu tracking.
- Manual Seller Center fallback chỉ còn cho Shopee no-API `khogiadungcona`; API shops stale diagnostic không được queue fallback lại.
- Panel OMS shop selector dùng Core endpoint `/api/core/shops` theo từng platform, dropdown only, không cho nhập display text.

## Cập nhật cụm OMS Đồng bộ & tải lại 2026-05-20

- `Đã xong`: thêm route `POST /api/label/retry-failed` để retry tem lỗi theo ngày/shop/sàn/trạng thái, dry-run trước, chạy thật sau, batch `10/20/50`, vẫn giữ budget subrequest và cursor/retry.
- `Đã xong`: thêm route `POST /api/orders/manual-sync/backfill` cho TikTok `0909128999` và Shopee no-API `khogiadungcona`; route bắt buộc date range hoặc mã đơn, không quét toàn bộ vô điều kiện.
- `Đã xong`: source resolver chặn Seller Center fallback cho Shopee API shops `chihuy1984`, `chihuy2309`, `phambich2312`, `kinhdoanhonlinegiasoc@gmail.com`.
- `Đã xong`: TikTok runner chỉ one-shot qua local helper `/report-run` với `watch=false`, profile automation `E:\shophuyvan-python-automation\profiles\browser\shophuyvan-runner-tiktok`, tự pause sau batch; profile user chỉ dùng kiểm UI.
- `Bị khóa an toàn`: không dùng endpoint `ship_order`, batch ship, arrange, confirm, cancel, RTS, gửi tin live hoặc sync Payment live trong cụm này.

## Cập nhật hotfix OMS source/label 2026-05-20

- Shopee shipping document đã đối chiếu local Open Platform docs:
  - `/api/v2/logistics/get_shipping_document_parameter`: đọc loại chứng từ đề xuất.
  - `/api/v2/logistics/create_shipping_document`: tạo task chứng từ in/waybill, phân loại `document_generation`.
  - `/api/v2/logistics/get_shipping_document_result`: kiểm task `READY/PROCESSING/FAILED`.
  - `/api/v2/logistics/download_shipping_document`: tải file waybill/PDF khi `READY`.
- Endpoint fulfillment/action bị cấm trong OMS label/status hotfix: `ship_order`, batch/mass ship, arrange shipment, confirm, cancel hoặc RTS. Không dùng endpoint đoán mò và không đổi trạng thái đơn trên sàn.
- Lazada shipping label/AWB dùng docs `PrintAWB` `/order/package/document/get`, batch package tối đa theo docs `20`; Worker hotfix đặt budget thấp hơn để không vượt Cloudflare subrequest.
- Source routing: Shopee API shops `chihuy1984/chihuy2309/phambich2312/kinhdoanhonlinegiasoc@gmail.com` phải dùng Open Platform trước; Lazada API shop `kinhdoanhonlinegiasoc@gmail.com` dùng Lazada API; Seller Center fallback chỉ cho `khogiadungcona` hoặc shop manual/no-API sau khi docs/API không thể đáp ứng.

## Mục đích

File này là checklist sống để hoàn thiện dần toàn bộ tính năng mà bộ endpoint hiện có của `Shopee` và `Lazada` cho phép. Mỗi lần làm xong một phase phải cập nhật lại:

1. Trạng thái từng nhóm tính năng.
2. Shop `có API` đang chạy được gì.
3. Shop `không có API` đang fallback theo cách nào.
4. Endpoint nào còn thiếu quyền hoặc còn thiếu app/category riêng.

## Nguồn tài liệu đã rà

- Bộ chỉ mục local đã quét từ tài liệu gốc:
  - `Shopee`: `427` endpoint
  - `Lazada`: `378` endpoint
  - `Tổng`: `805` endpoint
- Nguồn local:
  - `C:\Users\Admin\.codex\skills\shopee-open-platform-docs\references\shopee\endpoint-index.json`
  - `C:\Users\Admin\.codex\skills\shopee-open-platform-docs\references\lazada\endpoint-index.json`
  - `C:\Users\Admin\.codex\skills\shopee-open-platform-docs\references\marketplace-endpoint-index.md`

## Quy ước trạng thái

- `Đã xong`: đã có core, đã deploy, đã kiểm tra thực tế.
- `Đang làm dở`: đã có core nền hoặc đã làm một phần, chưa khép kín hết luồng.
- `Chưa làm`: chưa có core hoặc chưa có UI/backend vận hành.
- `Bị khóa an toàn`: đã có endpoint hoặc đã có preview, nhưng cố tình chưa cho ghi thật.
- `Bị chặn bởi quyền/app`: có endpoint nhưng app hiện tại chưa có quyền hoặc chưa có app/category đúng.

## Core dùng chung đã chốt

- `marketplace_shop_capability_core`
- `shop_order_product_core_read`
- `order_transport_core`
- `order_time_core`
- `order_status_core`
- `shopee_status_core`
- `return_reverse_core`
- `order_finance_core`
- `product_catalog_core`
- `sku_identity_core`
- `inventory_stock_core`
- `product_write_guard_core`
- `ads_campaign_guard_core`
- `chat_worker_core`
- `chat_shopee_bridge_core`
- `video_library_core`
- `video_analytics_core`
- `marketplace_push_core`
- `promotion_tool_core`
- `review_core`
- `return_complaint_core`
- `customer_risk_core`

## Cập nhật 2026-05-20 - Cleanup khóa vận hành status/detail/label

- `Đã xong`: route legacy `POST /api/labels/refresh/*` chỉ còn trả `410 legacy_label_refresh_route_disabled`; frontend không còn caller route này.
- `Đã xong`: xóa helper frontend Shopee không còn caller và không cho UI tự dựng Seller Center URL từ `order_sn`.
- `Đã xong`: Shopee API label runtime chỉ còn `download_shipping_document`; đã cắt endpoint `create_shipping_document`, `get_shipping_document_result`, cờ `allowCreate` và local helper Shopee cũng không còn `ship_order` trong flow này.
- `Đã xong`: Radar/Sync tab local từ chối job `refresh_label` legacy bằng `legacy_refresh_label_disabled`; auto label chính thức đi qua `backfillEligibleLabels()` hoặc `POST /api/label/:orderId/refresh`.
- `Đã xong`: OMS/Admin hiển thị diagnostic status/detail/label runner gồm last run/status/error, `manual_required`, lỗi gần nhất và `next_retry_at`.
- `Đã xong`: guard `scripts/test-legacy-flow-locks.mjs` được đưa vào `npm test` để chặn khôi phục route/caller/helper legacy.

## Cập nhật 2026-05-19 - Realtime order status, Seller Center fallback và auto label runner

- `Đã xong`: route tổng `POST /api/orders/status/sync` điều phối Shopee/Lazada API status sync, Shopee Seller Center detail queue, TikTok Seller Center fallback queue và label backfill theo batch nhỏ. Cron `scheduled()` và `importOrdersV2()` gọi lại cùng runner, không đợi user mở OMS.
- `Đã xong`: Shopee API shops `chihuy1984`, `chihuy2309`, `phambich2312` dùng Shopee Open Platform status polling; Lazada `kinhdoanhonlinegiasoc@gmail.com` dùng Lazada API status polling. Cron nền vẫn không gọi Payment live.
- `Đã xong`: Shopee no-API/manual `khogiadungcona` có fallback Seller Center detail read-only qua `/api/orders/shopee-seller-detail/eligible|queue|backfill|diagnostic` và local helper `dongbochitiet.py`/`capnhattaichinh.py`; nguồn ghi là `shopee_seller_center_detail`, không phải API.
- `Đã xong`: chỉ có `order_sn` thì resolve detail URL từ Warehouse field hoặc Seller Center search; không tự dựng `/portal/sale/order/<order_sn>`. Detail id/url lưu ở `orders_v2.seller_center_detail_id`, `seller_center_detail_url`, `seller_order_detail_id`, `detail_url_source`, `detail_url_verified_at`.
- `Đã xong`: TikTok/manual `0909128999` tiếp tục dùng Seller Center/local helper fallback khi chưa có API order/token; pending settlement được queue đọc lại detail, không gắn API giả.
- `Đã xong`: auto label runner `backfillEligibleLabels()` và `POST /api/label/backfill-eligible`/`retry-failed` chạy theo batch nhỏ. Shopee/Lazada API dùng route document read-only có guard; Shopee no-API/TikTok queue `retry_label` local runner khi đủ điều kiện, profile chưa map mới ghi `manual_required`.
- `Bị khóa an toàn`: không gọi `create_shipping_document`, `ship_order`, `mass_ship_order`, `arrange`, `confirm`, `cancel`, không gửi tin live và không sync Payment live trong workflow này.

## Cập nhật 2026-05-19 - Capability tải tem vận chuyển theo shop/platform

- `marketplace_shop_capability_core` trả thêm capability chuẩn: `label_download_mode`, `label_download_supported`, `label_download_source`, `label_download_reason`, `label_download_read_only`, `label_download_requires_manual`.
- Shopee API shop: chỉ bật `label_download_supported=true` khi token live + shop id đủ và route chỉ tải shipping document đã sẵn sàng bằng `logistics.download_shipping_document`; không gọi `create_shipping_document`, `ship_order`, `mass_ship_order`, xác nhận đơn hoặc sắp xếp vận chuyển.
- Shopee no-API/manual: `manual_required`, `label_download_supported=false`; không gọi API giả và chưa bật browser/helper tự tải tem trong OMS.
- Lazada API shop: `api_print_awb_read_only`, đọc AWB/tem qua `order.package.document.get`/PrintAWB; không gọi RTS, arrange, cancel hoặc thao tác logistics ghi.
- TikTok: `manual_required`, `label_download_supported=false` vì chưa có API/token tải tem chính thức trong Core; browser/helper cũ chưa được coi là read-only an toàn để bật lại.
- Route chuẩn vẫn là `POST /api/label/:orderId/refresh` cho dry-run hoặc một đơn read-only khi `label_status=eligible` và capability cho phép; legacy `POST /api/labels/refresh/*` tiếp tục trả 410.
- Auto tải tem hàng loạt đã bật có kiểm soát qua `backfillEligibleLabels()` và `POST /api/label/backfill-eligible`; webhook marketplace, OMS/Kho tem in, Logistics drawer, `bulk-oms-status` và cron chỉ gọi route chuẩn read-only theo eligibility/batch nhỏ, không tạo job legacy `refresh_label`, không gọi helper chưa chứng minh an toàn và không quét toàn bộ đơn.

## Cập nhật 2026-05-19 - Chat legacy đã xóa/cắt khỏi runtime

- `Đã xong`: frontend legacy `chat-marketplace.html`, `chat-marketplace-page.js`, `fe-chat-marketplace-loader.js` và toàn bộ `fe-chat-marketplace/*` đã xóa khỏi repo/runtime.
- `Đã xong`: backend legacy `routes/worker-chat-marketplace/*` và `core/chat/*` đã xóa; Worker chính `/api/chat/*` trả `410 legacy_chat_route_disabled`.
- `Đã xong`: caller frontend cũ đã xử lý, OMS không còn mở `/api/chat/resolve-order-conversation`, service worker không còn fetch `/api/chat/notifications/latest`, link UI trỏ `chat-cskh.html`.
- `Đã xong`: Lazada Chat auth/disconnect cũ trả 410 rõ ràng, không mutate token/trạng thái.
- `Đã xong`: bridge Shopee giữ lại cho Chat mới nằm ở `routes/marketplace-chat/shopee-bridge.js`, chỉ phục vụ `/api/internal/chat-bridge/shopee/sync` và `/messages/send`; bridge read cũ trả `410 legacy_bridge_read_disabled`.
- Shop có API: Shopee/Lazada vẫn đi qua Core capability và Chat Worker mới; shop không API/TikTok vẫn `manual_reference/manual_import`, không gắn nhãn API giả.
- Deploy/verify: Worker chính `04e42159-a24d-49e9-9e6e-eaea13b7c59b`, static UI `8c3807de-197a-4daa-81e1-3eb1ac697990`; Chrome profile ShopHuyVan pass desktop/tablet/mobile, Network không còn request `fe-chat-marketplace` hoặc Worker chính `/api/chat/*`; Finance Core `2026-05-18` status ok và duplicate exact `order_items=0`.

## Cập nhật 2026-05-18 - Shopee Shop Profile Core cho tên shop

- `Đã xong` trong phạm vi Shop display: Shop Core đã có snapshot `shop_core_profiles` để cache tên shop từ Shopee Open Platform thay vì để Chat/CSKH tự render raw `shop_id`.
- Endpoint chính thức đã xác minh: `GET /api/v2/shop/get_shop_info` (`v2.shop.get_shop_info`) dùng `shop_name`; endpoint bổ sung `GET /api/v2/shop/get_profile` (`v2.shop.get_profile`) dùng `response.shop_name` và `response.shop_logo`.
- Worker chính mở route đọc an toàn `GET /api/shops/shopee-profile-sync`; route này chỉ đọc Shop/Profile API, không gọi endpoint ghi.
- `/api/core/shops` và `/api/core/shops/:shopId/summary` trả thêm `shop_display_name`, `shop_name_source`, `shop_profile_source`, `shop_name_missing`.
- Chat Worker conversation API dùng Shop Core làm nguồn tên shop; UI thiếu tên hiển thị `Shop chưa đồng bộ tên` hoặc badge `Thiếu tên shop`.
- Runtime guard ở Worker chính, Chat Worker và UI mới đều chặn tên dạng raw numeric hoặc `Shopee <id>` làm display name.
- Shop không API không gọi Shopee Shop API và không gắn nhãn `API chính thức`.
- Kiểm production: `170044686` đã resolve `GIA DỤNG HUY VÂN`, `166563639` đã resolve `shophuyvan.vn`; cả hai có `shop_name_source=shopee_shop_api`, `shop_name_missing=false`.
- Deploy liên quan: Worker chính `d8e7ae88-a31e-4e2c-8b71-3a95bb4872b3`, Chat Worker `ff2d5b00-9bdb-4f6e-be0f-9825a95875af`, static UI `16ebeba1-47cb-4b11-bd4a-47ede90e02f2`; production UI pass desktop/tablet/mobile bằng profile ShopHuyVan.

## Cập nhật 2026-05-18 - Core đọc chung Shop/Order/Product cho Chat/OMS

- `Đang làm dở`: đã thêm endpoint đọc chung `/api/core/*` trong Worker chính để Chat/OMS dùng cùng nguồn Shop Core, Order Core, Product Master Core và Finance/Fee field metadata.
- Shop có API Shopee: đọc `shops`, `orders_v2`, `order_items`, `order_fee_details`, `products`, `product_variations`, snapshot catalog; không fake API data.
- Shop chưa API: trả capability fallback/manual/import/cost setting, UI phải hiện `Shop chưa có API` và không gắn nhãn đồng bộ API.
- Chat UI mới đọc `/api/core/orders/by-conversation/:conversationId`; nếu thiếu mã đơn hoặc buyer identity thì không tự đoán đơn.
- Tài liệu chi tiết: `docs/core-data-map.md`, `docs/shop-order-product-core-plan.md`.
- Production đã deploy Worker chính version `c6fc36ec-52e1-4714-8474-f4167598020a` và static UI version `6fb0babd-e581-47dd-a6d4-2009c9a45fe3`; kiểm `chihuy1984` API, `khogiadungcona` fallback, order `260518QJM5HP6U`, SKU `HV999K241300S`, và Chat UI desktop/tablet/mobile đều pass.

## Cập nhật 2026-05-19 - Order auto scan theo capability

- `Đang làm dở`: auto scan order đã được audit/khóa theo capability, không thêm nguồn order thứ hai.
- Shopee API order dùng endpoint chính thức `GET /api/v2/order/get_order_list` và `GET /api/v2/order/get_order_detail`; chỉ shop có token/API hợp lệ mới polling API.
- Shop có API order: Lazada `kinhdoanhonlinegiasoc@gmail.com`, Shopee `chihuy1984`, `chihuy2309`, `phambich2312`.
- Shop không API order: Shopee `khogiadungcona`; TikTok `0909128999` hiện chưa có API order/token chính thức trong hệ thống.
- Fallback hợp lệ cho shop không API/TikTok: `browser_sync`, `import_file_sync`, `manual_reference` có log và upsert vào `orders_v2/order_items/order_fee_details` nếu có. Không fake API, không gắn nhãn `đồng bộ API`.
- Worker cron: `*/5 * * * *` polling Shopee/Lazada theo từng sàn; `0 0 * * *` chạy job ngày. Cron nền Shopee status không gọi escrow/payment (`fetch_fees=0`) để tránh Payment live sync.
- `marketplace_shop_capability_core` và UI admin phải hiển thị `order_sync_mode`, lần quét cuối và lỗi gần nhất từ diagnostic; không im lặng bỏ qua lỗi sync.
- Capability/UI admin phải hiển thị thêm runner: Worker cron API `syncApiOrders/syncApiOrderStatuses` cho Shopee/Lazada API; local `report_worker` cho TikTok/import/manual; local Radar cho browser helper. Nếu local helper không thấy process, ghi rõ `Chưa có runner tự động`.
- `report_worker` hợp lệ chỉ là luồng đọc/import report từ `/api/jobs`; không được dùng để gửi tin, sync Payment live hoặc gọi marketplace write action.
- Finance Core stale guard vẫn bật: ngày `2026-05-18` thiếu 1 analytics row so với 68 order normal nên phải rebuild bằng `sync_payment=false`.

---

## 1. Đơn hàng, hủy, hoàn, reverse, tài chính đơn

### Module endpoint liên quan

**Shopee**
- `Order`
- `Returns`
- `Logistics`
- `FirstMile`
- `Payment`

**Lazada**
- `Order API`
- `Return and Refund API`
- `Logistics API`
- `Lazada Logistics API`
- `FBL API`
- `Finance API`
- `LazPay API`

### Tính năng có thể làm

- Đồng bộ đơn thật từ API về `orders_v2`
- 2026-05-14: thêm endpoint repair `GET/POST /api/orders/backfill-missing-items` cho Shopee shop có API; lấy order thiếu `order_items` từ DB rồi gọi `/api/v2/order/get_order_detail` theo đúng `order_id`, không chạy sync tổng và không xóa đơn có revenue. Production Worker `8fa2cd50-0ccc-4ee7-ab06-734fee038596` đã backfill shop `chihuy1984`: `47` đơn, `61` dòng item, `missing_after=0` cho nhóm có revenue.
- Đồng bộ trạng thái chi tiết theo cập nhật mới nhất
- Tách ledger hoàn/hủy/reverse riêng, không chỉ nhìn `order_status`
- Phân tích lý do hủy theo shop, sàn, SKU, người bán hủy hay khách hủy
- Phân tích hoàn theo nguyên nhân, thời gian xử lý, tiến độ reverse
- Cảnh báo `FAILED_DELIVERY`, `TO_RETURN`, đơn pending quá lâu
- Theo dõi SLA vận chuyển, nhãn, package, AWB
- Đối chiếu doanh thu đơn với payout/payment/finance
- Chuẩn hóa doanh thu:
  - đã đặt
  - đã thanh toán
  - giao thành công
  - đã hủy
  - đã hoàn
  - hoàn một phần
  - đang chờ đối soát

### Luồng shop có API

- Ưu tiên `API sync` + `push/webhook`
- Dùng chung `orders_v2` và ledger `reverse/return`
- Dashboard, Profit, OMS chỉ đọc core đã chuẩn hóa

### Luồng shop không có API

- `browser_sync`
- `import_file_sync`
- `manual_reference`

### Trạng thái hiện tại

- `Đã xong`
  - Chuẩn hóa `source_mode/source_detail/source_updated_at`
  - Giảm tải `refresh_returns` để tránh đụng giới hạn subrequest của Worker
  - Chuẩn hóa `Bangkok time` cho một phần luồng báo cáo
  - `return_reverse_core` backend/API đã ghi ledger chung `marketplace_return_reverse_ledger` cho Shopee Returns và Lazada Reverse/Return
  - Shopee Returns và Lazada Reverse/Return đã ghi ngược trạng thái hiện tại vào `orders_v2` để OMS hiển thị đúng nhóm hoàn/trả sau khi bấm `Quét trạng thái`
  - OMS `Làm mới` và `Quét trạng thái` đã gọi thêm sync Returns/Reverse theo shop/sàn đang lọc; production đã kiểm endpoint trả `status=ok`, Shopee/Lazada không có return/reverse mới trong cửa sổ kiểm nên `orders_updated=0`, còn tab Hoàn Hàng hiển thị `46` đơn trong 30 ngày và `1` đơn đang khiếu nại
  - OMS `Hoàn Hàng` đã mặc định 30 ngày gần nhất, có chọn 7/45 ngày hoặc tất cả lịch sử; bảng và badge tab con dùng cùng phạm vi thời gian để tránh màn hình bị ngập đơn hoàn cũ
  - OMS `Chờ Xử Lý` đã có cửa sổ vận hành 30 ngày cho nhóm `PENDING`/`LOGISTICS_PENDING_ARRANGE`; đơn pending cũ vẫn tìm được bằng mã đơn hoặc lọc ngày nhưng không còn chiếm tab `Chưa xử lý`
  - API đọc ledger `/api/returns/ledger` và `/api/returns/summary` đã deploy lên Worker; sync an toàn production đã trả `status=ok`
  - Profit Dashboard đã đọc `total_return_refund` từ ledger để trừ phần hoàn tiền API đã chốt
  - UI production bằng profile admin `ProductionAdminTest` đã bấm `Tải ledger`, `Đồng bộ Shopee 24h`, `Đồng bộ Lazada 30 ngày`; tất cả API trả 200 và hiển thị ghi chú nguồn dữ liệu đúng
  - `order_finance_core` đã gom `order_analytics`, `order_fee_details`, return ledger và Ads snapshot vào API `/api/order-analytics/finance-core`
  - `order_finance_core` đã có snapshot D1 `marketplace_order_finance_daily_snapshots` để báo cáo ngày/tháng đọc lại từ core
  - Lazada Finance/LazPay adapter đã nối route `/api/income/lazada/transactions`, `/api/income/lazada/payout-status` và nguồn `lazada.finance.transaction.details.get` vào `order_finance_core`
  - Dashboard lợi nhuận đã sửa `Tổng Phí Sàn` để không hiện 0 khi bucket chi tiết chưa tách đủ nhưng `orders_v2.fee` đã có tổng phí thật
  - Dashboard lợi nhuận 2026-05-09 đã nối lại bucket `Tổng Phí Sàn` với `order_fee_details` và `marketplace_ads_campaign_snapshots`; phần chưa tách chỉ còn là đơn chưa có Payment/Finance detail, không phải toàn bộ phí sàn
  - Profit Dashboard 2026-05-09 đã tách rõ thêm bucket phí đóng gói/vận hành/labor, chuẩn hóa `cancel_reason_vi` cho lý do hủy tiếng Việt, đổi `Doanh thu Tháng` thành `Doanh thu Năm` theo `report_month`, thêm KPI ADS/hoàn/vốn/vận hành/thuế và gom bộ chọn nhiều shop thành nhãn số lượng shop đã chọn
  - Profit Dashboard 2026-05-11 đã sửa bộ lọc `platform + shop + from/to` cho `/api/dashboard`, tránh lỗi D1 khi query có join; KPI chính đổi sang `Đơn Hoàn Thành`, còn `đơn hợp lệ chưa hủy/hoàn` hiển thị ở dòng phụ để đối chiếu ShipXanh không bị nhầm khái niệm
  - Profit Dashboard 2026-05-12 đã đổi KPI chính về `Đơn bán hợp lệ = tổng đơn - hủy - hoàn`, chuyển `Phí Đóng Gói` từ cost setting sang `Tổng Phí Sàn`, giữ `Chi Phí Vận Hành` không trừ đóng gói lần hai, tách KPI render/core để các file liên quan dưới 20KB, và re-upload 8 file báo cáo 2026-04 bị parser sai. Production Worker `57ac9df6-0b20-4fa0-b8f6-e7a55ae45e24`, Frontend `49e1d120-ec24-4a57-9f38-a768c8c3324f`; Chrome profile `ProductionAdminTest` đã kiểm Dashboard, Report Upload và mobile 390px OK.
  - `Lãi ròng API` 2026-05-13 đã sửa đúng luồng Shopee Payment/Escrow cho đơn hoàn và đơn thiếu Payment API: tách `order-analytics` thành core nhỏ dưới 30KB, giữ đúng dấu âm `escrow_amount`, tự sync thêm `get_escrow_detail` khi bấm `Đồng bộ Payment + tính lại`, và chặn trừ hoàn/vốn lần hai nếu Payment đã net hoàn. Production Worker `be93c0f5-92ef-46b8-b57f-75e3ca921021`, Frontend `4f1bbcfe-06d3-4032-8fdc-f5e4f7d71e54`; kiểm production đã chốt `2605127JX9N4N6 => -1.620đ`, `RETURN_REFUND`, `cost_of_goods=0` và `260513A4HT5Q1Y => thực nhận 62.175đ`, `lãi 33.675đ`.
  - `Lãi ròng API` 2026-05-14 đã thêm core suy luận đơn Shopee doanh thu `0` nhưng hoàn/trả toàn phần: chỉ giữ phí hoàn/trả `1.620đ`, nhả vốn và không phân bổ ADS khi chưa có Payment/Escrow thật. Production D1 đã rebuild Shopee tháng 04 và kiểm `260411HCTWXDA7`, `260413MTSAS0M6`, `260414R8K8K8DF`, `260415U2XXPFNK` đều còn `net_profit=-1.620đ`, `cost_of_goods=0`, `ads_cost_allocated=0`; top SKU/đơn âm tiền không còn nhân toàn bộ lỗ vào từng SKU khi thiếu tỷ lệ doanh thu dòng.
  - Profit Dashboard 2026-05-14 đã sửa tab `Theo Báo Cáo Sàn` dùng doanh thu báo cáo ròng đã trừ hoàn/hủy, đồng thời hiện `DT báo cáo gốc`, `Hoàn/hủy đã trừ`, `DT đơn import`, `Chênh lệch` và chi tiết theo shop giống tab import. Production tháng 04 trả `gross=190.788.888đ`, `net=185.135.857đ`, `refund=5.509.000đ`, `6` shop; Chrome profile `ProductionAdminTest` đã kiểm UI thật không còn shop sinh tự động `Shopee 166563639`.
  - 2026-05-13 đã tách `shopee_status_core` tại `apps/worker-api/src/core/orders/shopee-status-core.js`: Shopee `COMPLETED` không còn bị `return_status` phụ ghi đè thành Hoàn; import file đã tách parser theo sàn và chặn nhãn generic `Trả hàng/Hoàn tiền` làm phình KPI Hoàn. Đã deploy Worker `b7ead65c-bccc-4e5e-ab1d-a500358c82ff` và frontend/static assets `3c3b8947-48a1-4215-a7d6-ad13d7a1fdad`. Dữ liệu tháng 04 shop `phambich2312` còn cần file đơn gốc đầy đủ để sửa chính xác từng mã đơn theo ảnh ShipXanh.
  - Top SKU trong `Lãi ròng` đã tách tab `SKU cần xử lý`, `Đơn âm tiền`, `Tổng quan phí/vốn`; đơn âm tiền đọc chi tiết từ `order_analytics/order_items` để hiện SKU, tên sản phẩm, ảnh, giá vốn, CPO và hoàn tiền
  - `Order API phase 1` đã có workspace riêng trong Trung tâm API nâng cao, gom đơn cần theo dõi theo shop/sàn và tách rõ shop `có API` với shop `không có API`
  - Nút `Làm mới order phase 1` chỉ đồng bộ đơn/trạng thái/tracking, không gửi lệnh ghi thật; link `Xem khu order phase 1` nhảy thẳng tới khu dữ liệu để giảm kéo trang trên mobile; production đã kiểm bằng API action giới hạn `chihuy2309`, `limit=3` và Chrome CDP trên `oms-dashboard.html#api-advanced`
  - `Order API phase 2` đã có workspace/module riêng trong Trung tâm API nâng cao để phân loại thao tác có guard: dry-run Shopee `ship_order/mass_ship_order`, đơn hủy cần chọn hướng, đơn thiếu tracking và shop không API
  - Action `preview_order_phase2` đã deploy production, trả `dry_run=true`, `sent_to_shopee=false`; kiểm bằng API action giới hạn `chihuy2309`, `limit=20` và Chrome CDP trên `oms-dashboard.html#api-advanced`
  - `Số dư doanh thu` đã bổ sung Shopee Payment `get_escrow_list`, `get_escrow_detail`, `get_escrow_detail_batch`, `get_payment_method_list`, `get_payout_detail`
  - `Số dư doanh thu` 2026-05-09 đã tách tab `TTLK / giảm Shopee`: backend đọc `fee_affiliate` và raw escrow `voucher_from_shopee`, `shopee_discount`, `coins` từ `order_fee_details`; UI lọc được `11` đơn có TTLK và `187` đơn có giảm từ Shopee trên production, không dùng cost setting
  - Lazada Finance đã sửa đúng `/finance/transaction/details/get` và thêm `/finance/transaction/accountTransactions/query` theo POST; UI tách mục ngang để không kéo một trang dài
  - TikTok Finance/payout chưa đưa vào số dư doanh thu vì repo chưa có endpoint chính thức đã xác thực; không tạo số fallback từ đơn hàng hoặc cost setting
  - OMS phase 1 `phí sàn API-first` đã deploy: popup phí đọc `fee_breakdown` từ backend, tách rõ `Phí sàn từ API`, `Thuế/khấu trừ từ API`, `Chi phí nội bộ`, `Ước tính còn thiếu`
  - OMS 2026-05-09 đã thêm nhóm đối soát `Giảm giá / TTLK / ADS` ngay trong popup phí từng đơn: Shopee đọc voucher/giảm giá từ raw escrow `order_fee_details.raw_data`, TTLK/ADS đọc từ `fee_affiliate`/`fee_ads`; phần nào API chưa trả thì hiện `Chưa có` và ghi rõ cost setting chỉ là ước tính.
  - Cleanup production `POST /api/orders/cleanup-fee-phase1` đã quét `9578` đơn và cập nhật `1404` đơn bị lệch giữa `orders_v2` cũ với breakdown phase 1
  - `calcProfit()` legacy và các route cũ `orders / api-sync / dashboard priceCalc` đã đổi sang dùng chung source of truth phase 1 từ `order-fee-phase1-core`
  - Refactor 2026-05-13 đã tách `api-sync.js` thành wrapper và module theo `common`, `shopee`, `lazada`, `ads`, `finance`, `orders`, `products`, `returns`; toàn bộ file trong cụm mới dưới 30KB, Worker production version `819744c3-0b4a-47fa-8758-baf7bcccf2e1` đã kiểm API đọc an toàn.
  - Cron API sync 2026-05-14 đã đổi sang quét tất cả shop API theo batch nhẹ cho đơn và trạng thái, không xoay vòng một shop duy nhất; shop không API không bị gắn nhãn đồng bộ API và vẫn đi import/browser có kiểm soát.
  - API order sync/realtime 2026-05-14 đã sửa lỗi shop có API không kéo đơn do order sync gọi token cũ trực tiếp và thiếu binding `feeDetailToPayload` sau khi tách module; Shopee/Lazada order sync/status chuyển sang helper refresh token theo shop, diagnostic ghi `last_order_sync_*`, `last_order_status_sync_*`, webhook và realtime mode. Worker production `6968a6dc-b246-4d0f-b30a-247080cc810c`, Frontend `890e5a93-6333-4ec1-acb5-fd30dd4ee9b3`; production smoke đã kéo Shopee `3/3` shop API, Lazada `1/1` shop API, status sync OK và UI `Kết nối API` hiển thị `KÉO ĐƠN OK`, `TRẠNG THÁI OK`, `REALTIME Fallback polling`.
  - OMS đã tách `IN_CANCEL` thành tab con `Khách Yêu Cầu Hủy`, không tính là `CANCELLED` cho tới khi người bán xác nhận.
  - Route `POST /api/orders/buyer-cancellation/decide` đã nối Shopee `handle_buyer_cancellation` và Lazada `reverse/cancel/seller/decide` ở chế độ có guard: bắt buộc đơn OMS đang `IN_CANCEL`, bắt buộc xác nhận rõ, thiếu dữ liệu thì không gửi lệnh lên sàn.
  - Hoàn/trả đã có hồ sơ khiếu nại nội bộ `return_complaint_cases`: OMS tách tab `Đang Khiếu Nại`, gom video đóng gói/tem/mã return/reverse và lưu trạng thái `needs_evidence / ready_to_send / marketplace_processing / manual_required / marketplace_replied / error`.
  - Shopee có API đã nối bước gửi chứng cứ qua `/api/v2/returns/upload_proof`: chỉ gửi khi có `return_sn`, có video đóng gói và người vận hành bấm xác nhận; trạng thái OMS chuyển `Sàn đang xử lý`.
  - Lazada/shop không API mới tạo hồ sơ + link video để thao tác tay; chưa đánh dấu đã gửi API nếu chưa nối endpoint upload chứng cứ chính thức.
  - Production 2026-05-08 đã deploy Worker `c0546897-4da6-4884-8c2e-5cac40232f7c` và Frontend `87a8995d-8da1-4685-823b-7047bec2306c`; kiểm bằng đơn test `CODEXRET20260508A01`: quét tem/video OK, quét nhận hoàn OK, tab `Đang Khiếu Nại` OK, guard thiếu `return_sn` chặn gửi khiếu nại giả lên Shopee.
  - OMS 2026-05-09 đã đưa nút `Đồng ý hủy` / `Từ chối hủy` vào ngay dòng đơn `IN_CANCEL`, vẫn dùng guard `/api/orders/buyer-cancellation/decide`; đồng thời chặn ô tìm kiếm bị browser autofill thành tài khoản như `shopee_reviewer` sau refresh.
  - OMS 2026-05-09 đã gom đúng vòng đời hoàn/trả vào tab `Hoàn Hàng`: `Tất Cả 254`, `Yêu Cầu Trả Hàng 59`, `Đang Hoàn Về Shop 58`, `Shipper Đã Trả Hàng 70`, `Đã Nhận Đơn Hoàn 67`, `Đang Khiếu Nại 1`, `Thất Lạc 0`; API danh sách và badge cùng đọc logic `order_type=return` + trạng thái hoàn thực tế.
  - OMS 2026-05-09 đã bỏ panel logistics tổng ở đầu trang, đưa `Hành trình đơn hàng`, kiểm tem, tìm video, quét/nhận hoàn và khiếu nại vào drawer theo từng dòng đơn; production Frontend `74b0e310-7f20-42e3-8dcc-e1e1b2dcdb30` đã kiểm mở drawer, kiểm tem thật và không còn `#logisticsWatchPanel`.
  - OMS 2026-05-09 đã sửa lệch số lượng tab con `Chờ Xử Lý`: `/api/orders/badges` đếm cùng logic cha/con với `/api/orders`; production Worker `6a9846ea-ea74-4ec6-96af-ed7fc6ced18c` và Frontend `eb7cd990-200e-45b7-8c05-d0eb4ce889ed` đã kiểm `Đã Xử Lý 5` khớp `Tổng 5 đơn`.
  - OMS 2026-05-09 đã có `customer_risk_core` phase 1: dựng hồ sơ khách hay hoàn/không nhận từ D1, thêm bộ lọc `Khách rủi ro`, `Rủi ro cao`, `Hay trả hàng`, `Hay không nhận` và badge cảnh báo ngay trên dòng đơn; production đã rebuild được `371` hồ sơ, `25` đơn cảnh báo và `11` đơn rủi ro cao.
  - OMS 2026-05-09 đã nâng cấp `Kho tem in`: UI có chọn tất cả trang, chọn tem lỗi, tải lại từ sàn, tải lại tem lỗi trang này, lọc Enter; `/api/labels/status` trả `api_connected/refresh_mode`; shop có API tải lại qua endpoint sàn, shop không API tạo job `refresh_label` cho Radar/Chrome local ở chế độ `download_only`, không tự đổi trạng thái đơn. Production Frontend `831522e1-2bbd-4c56-ad95-7417fd91697c` và Worker `f77c3efe-eee4-4e2e-8afc-fb3ef2e4080e` đã kiểm tiếng Việt không lỗi font, job no-API `260401MH05JSEW` kết thúc `failed` có lý do thay vì treo `processing`.
  - Shopee Kho tem in 2026-05-11 đã vá bot khi Seller Center đổi giao diện/nút in: nếu đơn đã xử lý nhưng chỉ hiện `Chuẩn bị hàng`, job `refresh_label` bấm tạo lại tem rồi bắt PDF, upload R2 và vẫn không tự đổi trạng thái OMS khi `download_only=true`. Radar tự quét mỗi 60 giây, đơn Shopee đã xử lý quá 1 phút mà thiếu PDF sẽ tự tạo job `refresh_label`; job thật `464` đã hoàn tất cho `2605103NWWV4R4` và `2605103GCHMR0T`, `/api/labels/status` trả `has_label=true`. Bot cũng lưu screenshot/HTML/ticket khi phát hiện selector Shopee đổi, để gửi lỗi kèm bằng chứng qua inbox Telegram/Codex.
  - TikTok 2026-05-09 đã sửa luồng `refresh_label` qua Radar: processor đọc đúng payload `{ order_ids, download_only }`, không nhầm khóa payload thành mã đơn, bấm đúng dòng đơn `In giấy tờ` -> `Nhãn vận chuyển (A6)` -> `In` -> `Tiếp tục in`, chỉ tải lại tem và upload R2 khi `download_only=true`, không tự đổi trạng thái sang `Đã đóng gói`; kiểm thật job `431` cho đơn `583937967333738299` đã hoàn tất và `/api/labels/status` trả `has_label=true`; OMS production bấm `Tem` thấy `Tem hợp lệ`, bấm `Đánh dấu đã đóng gói` thành công.
  - TikTok 2026-05-09 đã vá tiếp luồng tải lại tem khi Seller Center đổi hành vi nút in: bấm chuột thật vào `In giấy tờ`, chọn lại `Nhãn vận chuyển (A6)` nếu nút `In` bị khóa, dọn popup lỗi giữa các đơn, bắt PDF qua popup/iframe/network/download và fallback qua trang `Nhãn vận chuyển`. Kiểm thật profile `0909128999` đã lưu R2 cho `583926465542653699` và `583927560935409144`; riêng `583925370138231954` đã `Đang trung chuyển` và TikTok không còn trả tem qua UI/kho nhãn nên vẫn `not_found`.
  - Kho tem in 2026-05-09 đã bỏ phần `Tên shop/ký hiệu`, `Vị trí dấu chữ` và cấu hình dấu chữ theo từng sàn vì làm xấu tem; core gộp PDF không còn vẽ badge chữ shop/sàn, chỉ giữ logo, nhắc quay video và hotline. Frontend production `f76b7921-2cb4-4513-a326-04a66ff93a96`.
  - Kho tem in 2026-05-09 đã đổi preview mẫu in sang dùng tem thật từ `order_labels`/R2 theo từng sàn; frontend lấy danh sách tem OK rồi thử mở file thật, chỉ file trả HTTP 200 mới được dùng làm mẫu, không còn dựng lại tem giả. Kiểm thực tế phát hiện record Lazada `524852422408031.html` bị `not_found` và đã chuyển thành tem lỗi. Frontend production `20e34476-45a9-4663-8bab-7aa6f76372d9`.
  - OMS 2026-05-09 đã sửa 3 vùng thao tác trong `Tùy chỉnh phiếu giao hàng`: công tắc watermark bật/tắt thật, `+ Thêm mẫu` tạo dòng mẫu mới, và bấm cả hàng mẫu để mở setting lớp; production Frontend `8b79a8b5-787a-46c7-b98a-721f1dcaa357` đã kiểm thao tác thật và console không lỗi.
  - Lazada Kho tem in 2026-05-09 đã sửa endpoint tải tem: `/order/document/get` chỉ giữ làm fallback vì production trả file bị che, luồng chuẩn chuyển sang Fulfillment `POST /order/package/document/get` (`PrintAWB`) với `package_id` lấy từ `/order/items/get`; production Worker `75e41146-48c8-45f0-afb8-dce605ea2a80` đã tải lại thành công hai tem Lazada `524852422408031` và `524729216304224` thành PDF thật, `/api/labels/status?platform=lazada` còn `2/2` tem OK, `0` tem lỗi.
- `Đang làm dở`
  - `order_transport_core`
  - `order_time_core`
  - `order_status_core`
  - Lazada Finance transaction detail đã deploy nhưng production app đang bị chặn quyền `App does not have permission to access this api`
  - đối soát payout/statement theo kỳ và dọn sâu thêm bucket Lazada Finance khi app production có đủ quyền transaction detail/accountTransactions
  - rà và nối TikTok Shop Finance/payout khi có tài liệu/quyền chính thức, sau đó đưa vào cùng `order_finance_core`
- `Chưa làm`
  - đối soát payout/thuế đầy đủ theo statement chính thức

### Checklist phase tiếp theo

- [x] Dọn dữ liệu bẩn `orders_v2` bị lẫn `manual_reference` với `api_sync`
- [x] Tách/giảm tải `refresh_returns`
- [x] Đồng bộ riêng `Shopee returns` vào ledger riêng
- [x] Đồng bộ riêng `Lazada reverse/return` vào ledger riêng
- [x] Nối `return_reverse_core` vào `profit-dashboard` (đã kiểm UI production sau đăng nhập)
- [x] Nối `order_finance_core` vào báo cáo ngày/tháng
- [x] Khóa OMS phí sàn theo phase 1 `API-first` và cleanup dữ liệu lệch trên production
- [x] Thêm ghi chú tiếng Việt trong UI về nguồn dữ liệu API / browser / import / manual
- [x] Sửa dashboard lợi nhuận hiển thị tổng phí sàn từ `orders_v2.fee` khi bucket phí chưa tách đủ
- [x] Tách chi tiết phí sàn, lý do hủy tiếng Việt và doanh thu năm theo tháng trong Profit Dashboard
- [x] Tách Top SKU lãi ròng thành tab con và thêm bộ lọc đơn âm tiền có SKU/sản phẩm/giá vốn/CPO
- [x] Sửa đơn Shopee hoàn/trả doanh thu 0 để chỉ giữ phí hoàn/trả thật/suy luận, không giữ vốn hoặc ADS khi đã hoàn toàn phần
- [x] Sửa tab `Theo Báo Cáo Sàn` dùng doanh thu ròng sau hoàn/hủy và hiển thị chi tiết theo shop
- [x] Bổ sung endpoint Shopee escrow/payout detail/payment method và Lazada account transactions vào `Số dư doanh thu`
- [x] Tách UI `Số dư doanh thu` thành các mục chức năng ngang, tải dữ liệu theo mục đang mở
- [x] Tách bộ lọc `TTLK / giảm Shopee` trong `Số dư doanh thu` từ `fee_affiliate` và raw Shopee escrow thật
- [x] Tách `IN_CANCEL` khỏi đơn hủy thật và thêm luồng xác nhận `Đồng ý hủy` / `Từ chối hủy` cho đơn khách yêu cầu hủy
- [x] Hiển thị `Đồng ý hủy` / `Từ chối hủy` ngay trên dòng đơn `IN_CANCEL`
- [x] Tạo `Order API phase 2` để preview dry-run thao tác có guard, tách rõ Shopee API / Lazada đọc-only / shop không API
- [x] Sửa kéo đơn API và realtime fallback polling: refresh token theo shop, báo lỗi thật lên UI, diagnostic shop API và cron một sàn mỗi lượt để tránh vượt quota subrequest
- [x] Thêm tab `Đang Khiếu Nại` cho đơn hoàn/trả và hồ sơ bằng chứng video đóng gói
- [x] Gom đúng vòng đời hoàn về shop vào tab con `Hoàn Hàng`
- [x] Nối Shopee `returns.upload_proof` ở chế độ bấm xác nhận, lưu trạng thái sàn đang xử lý
- [x] Chuyển hành trình/logistics khỏi panel tổng sang drawer theo từng đơn trong OMS
- [x] Sửa badge OMS để tab con `Đã Xử Lý` khớp `Tổng đơn` của bảng
- [x] Thêm cảnh báo khách hay hoàn/không nhận từ lịch sử D1 vào bộ lọc và dòng đơn OMS
- [x] Nâng cấp `Kho tem in` để tách shop API/browser, có chọn hàng loạt, tải lại tem lỗi và job no-API không treo
- [x] Tự tải lại tem Shopee cho đơn đã xử lý quá 1 phút nhưng thiếu PDF, có cảnh báo đổi giao diện kèm screenshot/HTML
- [x] Sửa TikTok `refresh_label` để tải lại tem qua Chrome helper không đọc sai payload và không tự đóng gói khi chỉ tải tem
- [x] Sửa TikTok `refresh_label` khi nút in đổi hành vi, bổ sung fallback trang `Nhãn vận chuyển` và bắt PDF từ network/download
- [ ] Nối Lazada upload chứng cứ/response flow chính thức cho reverse/return nếu endpoint và quyền app đủ
- [ ] Tự động đọc phản hồi khiếu nại sàn theo lịch, không chỉ bấm tay
- [ ] Rà TikTok Finance/payout chính thức trước khi cộng vào số dư doanh thu

---

## 2. Sản phẩm, SKU, tồn kho, giá

### Module endpoint liên quan

**Shopee**
- `Product`
- `Media`
- `MediaSpace`
- `AccountHealth`
- `Discount`
- `Voucher`
- `Bundle Deal`
- `Add-On Deal`
- `ShopFlashSale`
- `TopPicks`

**Lazada**
- `Product API`
- `Choice Customized API`
- `Cross Boarder Product API`
- `FBL API`
- `Seller API`
- `Content API`

### Tính năng có thể làm

- Đồng bộ catalog thật từ sàn
- Đồng bộ `item / model / SKU / tồn / giá`
- Map `item_id / model_id / platform_sku -> internal_sku`
- So sánh tồn sàn với tồn nội bộ
- Tách rõ:
  - tồn bán được
  - tồn giữ chỗ
  - tồn đã chiếm
  - tồn bị campaign giữ
  - tồn theo từng warehouse
- Cảnh báo lệch tồn
- Cảnh báo gần hết hàng
- Audit bài đăng:
  - thiếu ảnh
  - thiếu cân nặng
  - thiếu thuộc tính
  - sai danh mục
  - có cảnh báo vi phạm
- Kiểm tra SKU đang nằm trong khuyến mãi
- Preview sửa giá / sửa tồn / tắt bài / sửa model trước khi đẩy thật
- Tạo/sửa/xóa bài đăng và model khi cần

### Luồng shop có API

- Dùng `product_catalog_core`, `sku_identity_core`, `inventory_stock_core`
- Mọi thao tác ghi đi qua `product_write_guard_core`

### Luồng shop không có API

- Chỉ tham chiếu tồn nội bộ, import file hoặc browser hỗ trợ có log
- Không gắn nhãn “đồng bộ API”

### Trạng thái hiện tại

- `Đã xong`
  - `product_catalog_core`
  - `inventory_stock_core`
  - `sku_identity_core` bản đầu
  - Preview `listing/model write`
  - Audit cơ bản bài đăng
  - `inventory_stock_core` Lazada nâng cao đã có cột `stock_source_json`, `warehouse_stock`, `channel_stock`, `fbl_stock` và API `/api/products/inventory-stock-core`
  - Nối read-only Lazada FBL stock probe qua `/fbl/platform_products/get2`, `/fbl/stocks/getV3`, `/fbl/channel_stocks/get` khi gọi product sync với `include_fbl_stock=1`
  - Trang sản phẩm đã có panel `Review xấu theo sản phẩm`, đọc `/api/reviews/product-risk` và map review theo `item_id / SKU / tên sản phẩm`
  - ProductHub, parser Excel Shopee/Lazada/TikTok và Worker `/api/sync-variations` đã mặc định chỉ đồng bộ sản phẩm/phân loại có tồn kho `> 0`; dữ liệu hết tồn chỉ xem lại khi gọi rõ `include_out_of_stock=1`
  - Nút local `Bot Đồng Bộ SP Excel` đã tách đúng shop Shopee có API và chưa API: shop có API đi API không mở Chrome; shop chưa API dùng Chrome/browser và tự bám CDP nếu profile đang mở sẵn
  - Production đã kiểm `chihuy1984` qua API: sync `31/40` sản phẩm còn tồn, bỏ `9` sản phẩm hết tồn và `22` phân loại tồn `0`; endpoint mặc định sau sync `zero_or_less=0`
  - Local Chrome đã kiểm `phambich2312` chưa API: tải đủ 3 file Excel Shopee, ghép `76` sản phẩm / `137` phân loại còn tồn, bỏ `16` phân loại tồn `0`, endpoint mặc định sau sync `zero_or_less=0`
  - Local Chrome đã kiểm `khogiadungcona` chưa API: tải đủ 3 file Excel Shopee, ghép `72` sản phẩm / `127` phân loại còn tồn, bỏ `24` phân loại tồn `0`, endpoint mặc định sau sync `zero_or_less=0`
  - Local Chrome đã kiểm TikTok `0909128999`: tải export thật, xử lý nhiều template Excel, endpoint mặc định sau sync còn `148` dòng tồn `> 0`, khi gọi `include_out_of_stock=1` thấy tổng `234` dòng và `86` dòng hết tồn bị ẩn khỏi vận hành mặc định
  - Python local đã có core `profile_paths`: mọi luồng mở Chrome của bot dùng profile trong `E:/shophuyvan-python-automation/profiles/browser`, các profile bị tạo nhầm trên Desktop đã chuyển vào backup nội bộ và không còn chạy từ Desktop
  - TikTok product export đã có core gom theo job: mỗi ZIP tạo `runtime_jobs/tiktok_product_export/<shop>_<job_id>`, quét đệ quy template trong thư mục con, bỏ template rỗng, merge toàn bộ sản phẩm rồi mới sync một lần qua `ProductCoreHub`.
  - Kiểm dry-run bằng export TikTok thật đã lưu: `15` template gom thành `77` sản phẩm / `144` phân loại còn tồn, dự kiến `2` lô; test thêm template rỗng bỏ đúng `1` file.
  - UI `admin-products > Kết nối & Đồng bộ` đã tách 5 tab con `Tổng quan / Giá khuyến mãi / Bài đăng model / Kết nối API / Cảnh báo`, không còn dồn mọi tính năng thành một màn kéo dài.
  - Tab `Giá khuyến mãi` đã đổi sang bảng theo shop: tên sản phẩm, SKU sàn, giá gốc, giá KM hiện tại, ô nhập giá KM mới và tồn kho; phần nhập SKU thủ công chỉ còn trong mục nâng cao.
  - Tab `Bài đăng / model` đã đổi sang bảng bài đăng theo shop: tên sản phẩm, item ID, số SKU/model, giá đang bán, tồn và ô sửa tên mới; preview vẫn đi qua `product_write_guard_core`.
  - Modal `Đăng sản phẩm đa sàn` đã nối `marketplace_product_knowledge` vào preview/nháp để lấy đủ mô tả, ảnh, video, ngành hàng, thương hiệu, thuộc tính, cân nặng/kích thước nếu sàn có trả; UI tự điền form đăng và cảnh báo phần còn thiếu trước khi tạo nháp.
  - Production 2026-05-09 đã kiểm thật: nguồn Shopee `chihuy1984` tạo nháp `#1` lưu đủ `8` ảnh, video, ngành `101795`, `3` thuộc tính và cân nặng `0.15kg`; kích thước vẫn cảnh báo thiếu do nguồn sàn trả `0x0x0`.
  - Tab `Kết nối API` đã đổi sang thẻ shop gọn, mỗi thẻ gom sàn, shop, luồng xử lý, trạng thái API, kho lấy hàng và nhóm nút thao tác.
  - Production đã kiểm `admin-products#shops` version frontend `5e57e420-a20a-46a1-bd35-139cce287588`: tab giá tải `146` SKU `chihuy2309`, tab bài đăng/model tải `194` bài đăng, mobile `390px` không tràn ngang.
  - Sản phẩm/SKU 2026-05-14 đã thêm nút `Tạo sản phẩm` trên trang kho, sửa lưu metadata/giá để không gửi tồn kho khi core ShipXanh đang khóa tồn, và thêm core `Copy NB` tìm SKU nội bộ exact trước khi tạo mới. Production đã kiểm `1BOMACHPROK242` tồn tại trong `/api/products?search=BOMACHPROK242`, page tạo sản phẩm mở được, script `copy-internal-sku.js` đã override luồng cũ; phần preview bị chặn hiển thị rõ lý do bằng tiếng Việt.
  - App Python local đã sửa routing giá khuyến mãi Shopee theo API-first: `chihuy2309` và `chihuy1984` gọi Worker `/api/discounts/shopee/sync`, không mở Chrome; `phambich2312` và `khogiadungcona` mới dùng browser/Excel fallback.
  - Worker production đã kiểm Shopee Discount API read-only: `chihuy2309` đồng bộ `1` chương trình / `178` dòng sản phẩm-model; `chihuy1984` đồng bộ `1` chương trình / `179` dòng sản phẩm-model.
  - Parser Excel giá KM Shopee đã đọc header/cột linh hoạt hơn và tạo file upload copy `*_oms_gia_km.xlsx` thay vì ghi đè file gốc.
  - Parser TikTok đã nhận thêm cột `sale_price / discount_price / special_price / promotion_price` nếu template có giá sale thấp hơn giá gốc; TikTok vẫn chưa bật apply giá thật.
  - Cache TikTok production shop `0909128999` đã kiểm lại sau tối ưu: endpoint mặc định đang trả `148` variation và toàn bộ đều tồn kho `> 0`; `discount_price` đang `0` vì template hiện tại chưa có giá sale riêng.
  - Worker `/api/sync-variations` đã trả thêm `model_id` và filter được `platform` để phục vụ file upload giá KM TikTok.
  - Parser TikTok đã giữ lại `sku_id/model_id` từ template đồng bộ mới để không mất `SKU_id` bắt buộc của TikTok.
  - Python local đã có công cụ `oms_python/platforms/tiktok/promotion/tiktok_discount_template.py`: tạo file `Product Discount` TikTok từ mẫu TikTok + giá KM Shopee, có report dòng bị bỏ và hỗ trợ file `Tải xuống ID sản phẩm` `.xlsx/.csv/.zip` qua `--tiktok-id-file`.
  - Kiểm production luồng tạo file TikTok bằng file ID TikTok thật: `148` dòng TikTok còn tồn, `295` dòng Shopee, `272` dòng Shopee có giá KM dùng được; tạo được file upload `117` dòng, `31` dòng bị bỏ có lý do trong report.
- `Bị khóa an toàn`
  - `update_stock` lên sàn
  - `update_price` apply thật hàng loạt
  - `Up Giá KM` bằng app local cho shop Shopee có API; apply giá KM phải qua preview/queue trên web
  - Upload/apply file giá KM TikTok vẫn làm thủ công trên Seller Center, hệ thống chỉ tạo file và report trước
- `Đang làm dở`
  - map SKU phức tạp
  - đồng bộ promotion/violation sâu hơn cho đủ 2 sàn
  - production Lazada hiện chưa có FBL/platform product binding nên advanced rows vẫn `0`, đang rơi về `seller_quantity`
  - kiểm live lượt TikTok export kế tiếp trên Seller Center thật sau khi đã gom log theo job

### Checklist phase tiếp theo

- [x] Đồng bộ catalog thật
- [x] Đồng bộ tồn/giá/SKU cơ bản
- [x] Chặn sản phẩm/phân loại tồn kho `0` ở API, Excel/browser và Worker mặc định
- [x] Kiểm thực tế TikTok `0909128999` sau khi chặn tồn `0`
- [x] Gom log/export TikTok theo một job và bỏ template rỗng
- [x] Chuẩn hóa profile Chrome local vào `E:/shophuyvan-python-automation/profiles/browser`
- [x] Sửa routing giá khuyến mãi Shopee: shop có API đọc bằng API, shop chưa API mới dùng browser/Excel
- [x] Audit bài đăng cơ bản
- [x] Preview ghi bài đăng/model
- [x] Đăng đa sàn dùng nguồn bài đăng đầy đủ: ảnh, video, ngành hàng, thuộc tính và logistics từ snapshot API
- [x] Rút gọn UI `Kết nối & Đồng bộ` thành tab con và bảng trực quan theo shop
- [x] Tạo core file upload giá KM TikTok từ giá Shopee, có guard thiếu `SKU_id`
- [x] Thêm tạo sản phẩm mới, sửa lưu SKU/metadata không đụng tồn kho khóa, và sửa `Copy NB` để map SKU nội bộ exact thay vì báo duplicate sai
- [ ] Mở rộng `sku_identity_core` cho combo/multi-mapping khó
- [x] Đồng bộ `Lazada multiWarehouseInventories / channelInventories / FBL stock` (core/cột/route/FBL probe đã deploy; production hiện chưa có dòng advanced vì shop chưa trả warehouse/channel/FBL binding)
- [ ] Dashboard lệch tồn dùng chung cho Shopee + Lazada + TikTok
- [ ] Promotion-aware stock/price impact
- [ ] Mở `apply thật` cho giá theo quyền vai trò
- [ ] Tiếp tục giữ khóa `update_stock` cho tới khi chốt luồng ShipXanh

---

## 3. ADS và affiliate / campaign marketing

### Module endpoint liên quan

**Shopee**
- `Ads`
- `AMS`

**Lazada**
- `Sponsored Solutions API`
- `Lazada Wallet Corporate Top-up API`

### Tính năng có thể làm

- Dashboard campaign / adgroup / shop theo ngày, tháng
- Lịch sử snapshot chi phí, click, impression, doanh thu ADS
- Cảnh báo spend cao nhưng ROAS thấp
- Preview sửa budget / trạng thái / keyword
- Log request id từng lần đẩy lên sàn
- Gợi ý:
  - budget
  - keyword
  - ROI target
  - item nên chạy ads
- Auto top-up ví quảng cáo
- Kiểm tra trạng thái ký tài khoản ADS
- Đọc sản phẩm đang nằm trong Shopee Open Campaign qua `get_open_campaign_added_product`

### Luồng shop có API

- Dùng `ads_campaign_guard_core`
- Shopee và Lazada có core riêng phía adapter, UI dùng chung

### Luồng shop không có API

- Chỉ tham chiếu snapshot nội bộ hoặc import
- Không mở nút apply thật

### Trạng thái hiện tại

- `Đã xong`
  - Trang ADS riêng
  - 2026-05-24: Trang ADS chính đã đổi sang UI vận hành ra quyết định, first viewport chỉ còn tổng chi, hiệu quả, SKU cần xử lý, việc cần làm và bảng/card SKU; module kỹ thuật không còn lộ đầu màn hình.
  - 2026-05-24: `/api/ads/dashboard` trả read-model enrich từ ADS Core, Product Core, Warehouse Core, Finance Core và Promotion Core; UI chỉ render `decision_cards`, `recommendation`, `profit_after_ads`, `current_cost`, `available_stock`, không tự tính nghiệp vụ.
  - 2026-05-24: `POST /api/ads/sync-campaigns` trả log vận hành `job_id/scanned_count/updated_count/unchanged_count/empty_count/failed_count/core_readback_ok` để màn hình Kéo ADS không chỉ báo cache/loading; empty campaign range không tính là lỗi API.
  - 2026-05-24: Production pass bằng Chrome profile `E:\codex-chrome-profiles\shophuyvan-test`; Kéo ADS `job_id=ads_sync_1779611291216`, quét `3024`, cập nhật `3024`, lỗi `0`, `core_readback_ok=true`; desktop/tablet/mobile không tràn ngang và drawer SKU mở được.
  - Trang ADS đã chia thành các page con `Tổng quan / Guard ADS / TopPicks / Discount / Khuyến mãi sàn` để giảm kéo trang dài
  - Guard ADS đã chia thêm tab con `Quy trình chuẩn / Shop / API / Preview thao tác / Log đối soát`, có checklist thao tác đúng thứ tự để người vận hành biết cách check ADS trước khi đẩy thật
  - Guard preview `budget / trạng thái / keyword`
  - Refactor 2026-05-13 đã tách ADS frontend theo core tự trị: `ads.js` chỉ còn loader, logic nằm trong `apps/fe/js/dashboard/ads/`, CSS riêng ở `apps/fe/css/ads/ads-page.css`, `ads.html` dưới 30KB; production version `d84c66ad-5db2-4b01-9ce4-97450a6bc025` đã kiểm desktop/mobile.
  - Log request/preview ADS
  - Trang ADS đã có panel `Review xấu trùng ADS` và cột `Review` trong bảng SKU/campaign, đọc chung `review_core`
  - OMS Dashboard / Trung tâm API đã có action đọc `get_open_campaign_added_product` ở chế độ read-only
- `Đang làm dở`
  - phân tích sâu campaign/adgroup theo từng sàn
- `Bị chặn bởi quyền/app`
  - Shopee AMS Affiliate/Open Campaign có thể trả lỗi nếu shop chưa đồng ý AMS T&C hoặc app thiếu quyền `Affiliate Marketing Solution Management`
- `Bị khóa an toàn`
  - bật/tắt ADS thật trực tiếp nếu chưa đi qua Guard/admin confirm; action giảm/tắt trên UI vận hành hiện chỉ mở Guard/preview.

### Checklist phase tiếp theo

- [x] Tách ADS thành page riêng
- [x] Chia ADS thành page con để thao tác gọn hơn trên desktop/mobile
- [x] Làm `ads_campaign_guard_core`
- [x] Gom lỗi token và luồng refresh token
- [ ] Mở UI keyword thân thiện cho Shopee
- [ ] Batch adgroup/campaign guard cho Lazada
- [ ] Auto top-up ví Lazada
- [x] Nối read-only Shopee `get_open_campaign_added_product` vào Trung tâm API
- [ ] Mở affiliate/open campaign analysis sâu khi shop đủ quyền và có dữ liệu AMS
- [ ] Chỉ cho `apply thật` khi đủ endpoint ghi + role phù hợp

---

## 4. Video và media

### Module endpoint liên quan

**Shopee**
- `Video`
- `Media`
- `MediaSpace`

**Lazada**
- `Media Center API`

### Tính năng có thể làm

- Quản lý thư viện video
- Đăng video mới
- Sửa tiêu đề/mô tả/video info
- Xóa video
- Chọn ảnh cover
- Dashboard hiệu quả video
- Trend theo ngày
- Top video
- Top sản phẩm kéo đơn từ video
- Audience / demographics
- Gắn video vào phân tích sản phẩm
- Kiểm tra quota video
- Gắn `video_id` vào tạo/sửa sản phẩm

### Luồng shop có API

- Shopee: `video_library_core` + `video_analytics_core`
- Lazada: `video_library_core`, ưu tiên upload/media trước analytics

### Luồng shop không có API

- Chỉ tham chiếu `Kho video đóng gói`
- Không giả lập upload API

### Trạng thái hiện tại

- `Đã xong`
  - `dashboard_video.html`
  - Capability matrix API / không API
  - Shopee video center UI
  - Shopee Video API đã tách app/token riêng khỏi Shopee API chính: `/api/auth/shopee/video/url`, `/channels/shopee/video/callback`, lưu `video_partner_id/key`, `video_access_token`, `video_api_user_id`, trạng thái test quyền
  - Màn Kết nối API sàn có khối `Shopee Video API` riêng, dashboard video khóa sync/upload/sửa/xóa nếu chưa Test quyền video OK
  - Production đã kiểm trạng thái an toàn khi shop `chihuy1984` chưa lưu key video: UI mobile không tràn ngang, route connect trả `missing_shopee_video_app_config`, sync video không gọi API thật và trả cảnh báo thiếu Partner ID/Key video
  - Production 2026-05-08 đã sửa guard `user_id`: không dùng `shop_id/shop token` để gọi Shopee Video User API; nếu token sai loại thì test quyền báo rõ thiếu `user_id video` thay vì alert `Invalid access_token`.
  - Shop `chihuy1984` đã authorize lại bằng app Shopee Video, nhận `video_api_user_id`, bấm `Test quyền video` OK và `/api/video/capabilities` trả `video_sync_mode=api_live`, `video_ready=1`.
  - Đồng bộ đọc an toàn `POST /api/video/sync` cho `chihuy1984` trả `ok_count=1`, lưu `60` video library và `1` dashboard snapshot; `dashboard_video` production chọn đúng shop `chihuy1984`, cache đọc lại `60` video, mobile 390px không tràn ngang.
  - UI mobile 2026-05-08 đã rút gọn thành tab con `Tổng quan / Thư viện / Chi tiết / Upload / Tự động / Shop`; modal kết nối shop cũng tách `Cấu hình` và `Kiểm tra` cho Shopee Video API.
  - Hàng đợi upload video theo giờ đã có core D1 `marketplace_video_upload_queue`, file nguồn lưu R2, route tạo lịch/xem log/hủy/dry-run và cron 5 phút chỉ chạy job đã đến giờ.
  - Production đã kiểm tab `Tự động` mobile 390px cho `chihuy1984`: dry-run trả `0` job đến hạn, tạo job test xa tương lai rồi hủy ngay thành công, không đăng video thật lên Shopee; job test đã được dọn khỏi D1 sau kiểm thử.
  - Giao diện quản lý video production đã đổi sang bảng `Video đã đăng` giống Seller Center, mặc định hiện 20 dòng/lượt, PC/mobile không tràn ngang và body mobile giảm từ hơn `43.000px` xuống khoảng `4.307px`.
  - Các tab `Phân tích`, `Chi tiết`, `Upload`, `Lịch upload` đã chuyển sang layout bảng gọn: ảnh cover nhỏ, form upload theo hàng, preview/log lịch upload dạng bảng; tab `Phân tích` có bộ lọc/sắp xếp theo `Doanh số`, `Đơn đặt`, `Lượt xem` và ngưỡng tối thiểu.
  - UI 2026-05-08 đã gộp `Upload` và `Lịch upload` thành một tab `Đăng video`; trong tab chọn `Đăng ngay` hoặc `Hẹn giờ đăng`, log queue vẫn nằm cùng màn, URL cũ `view=automation` tự chuyển về tab này.
  - Khối phân tích đã có fallback: nếu Shopee chưa trả hiệu suất video theo doanh số/đơn, bảng `Video theo hiệu quả` dùng thư viện video để vẫn hiện lượt xem; insight SKU/video có nút thao tác và không còn chồng chữ.
  - KPI tổng tab `Phân tích` đã fallback từ `trend_json` khi Shopee trả `overview_json` rỗng; demographics rỗng không còn dựng 4 ô trống mà hiển thị cảnh báo nguồn dữ liệu gọn.
  - Bảng `Video theo hiệu quả` đã gọn lại: tiêu đề clamp 2 dòng/tối đa 92 ký tự hiển thị, pill tín hiệu không còn phình lớn.
  - Form `Đăng video` đã có meter tiêu đề `118` ký tự, nút `Gợi ý AI` qua Gemini/fallback OMS, và kiểm metadata file để chặn video ngoài giới hạn `1-180 giây` trước khi gửi upload.
  - AI tiêu đề bắt buộc có `#shophuyvan`, backend tự gắn hashtag chuẩn và form có guard so sánh video đã đăng để cảnh báo/tránh đăng lại video giống.
  - Luồng `Đa shop` đã tách riêng chiến dịch video: một `campaign_video_key`, một file gốc lưu R2 một lần, mỗi shop tạo một queue job riêng với tiêu đề, hashtag, sản phẩm gắn kèm, giờ đăng và trạng thái guard riêng.
  - Preview đa shop kiểm trước token/quyền Shopee Video, thời lượng, `#shophuyvan`, sản phẩm trong catalog từng shop, video giống trong thư viện và job đang chờ để phân nhóm `Chờ đăng / Thiếu API video / Video gần giống / Đã đăng / Đăng lỗi`.
  - Luồng `Đa shop` 2026-05-08 đã tách tiếp shop chưa API: preview trả `manual_upload`, UI có nút copy nội dung đăng tay và link Shopee Creator Center `https://banhang.shopee.vn/creator-center/video-upload/upload`; khi tạo chiến dịch, shop có API tạo queue, shop chưa API chỉ lưu log `manual_upload_multi_shop_campaign`, không gắn nhãn đồng bộ API.
  - Phase 1+2 2026-05-12 đã bắt đầu tách code video đa shop theo thư mục tính năng: picker sản phẩm ra `apps/fe/js/video/multi-shop/product-picker.js`, CSS đa shop ra `apps/fe/css/video/multi-shop.css`, catalog backend ra `apps/worker-api/src/core/video/catalog-core.js`; `/api/sync-variations` đã nối lưu thêm `marketplace_product_knowledge`/snapshot đúng `platform + shop` để shop không API dùng catalog riêng từ Chrome/local helper, không fallback link/item shop khác. Production đã deploy Worker `88f90a06-02f0-4efb-a3bd-1c663d980429` và Frontend `5067719d-7089-406f-a41b-e98ec72ed8d5`; UI thật xác nhận `khogiadungcona` gắn được K262 của chính shop, không hiện link K263 của shop khác, còn `chihuy1984` vẫn gắn được K263 từ catalog riêng.
  - Profile Verification 2026-05-12 đã bổ sung Lazada live proof vào `shopee-review.html`: trang reviewer hiển thị `Lazada live + Shopee pending`, đọc capability/library/quota Lazada bằng GET an toàn, production xác nhận `1/1` shop Lazada API live là `kinhdoanhonlinegiasoc@gmail.com`, quota endpoint OK; deploy Frontend `52e3c5c8-3038-4793-8f58-c5f85bb65f37`.
  - Production 2026-05-08 đã sửa lỗi `Lưu thông tin video` trong tab `Chi tiết`: backend không gửi đồng thời `video_upload_id` và `post_id` vào Shopee detail, route detail luôn trả JSON/CORS, frontend không để lỗi refresh phụ ghi đè trạng thái lưu thành công, cache core vẫn giữ tiêu đề đã sửa nếu Shopee detail trả dữ liệu cũ trong vài giây đầu.
  - Production 2026-05-08 đã sửa lỗi `cover 0 is illegal`: frontend không gửi cover rác, backend tự fallback cover hợp lệ từ cache/thư viện/Shopee `get_cover_list` trước khi gọi API sửa video; đã bấm lưu thật trên `chihuy1984` và HTTP `200`.
  - Production 2026-05-08 đã sửa lỗi sửa liên tiếp nhiều video: frontend reset cover/sản phẩm/form theo video mới, backend chỉ dùng cover thuộc đúng `video_upload_id`; đã test chuyển từ `vn-11110122-6v8go-mfygtcatbqj170` sang `vn-11110122-6v8gq-mhvjs56fzqip4b` rồi bấm lưu thật HTTP `200`.
  - Shop chưa API 2026-05-08 đã có job Chrome local `browser_upload_required`: helper mở đúng profile, tải file từ R2, mở Shopee Creator Center, upload/điền caption nếu đã login và dừng ở preview; nếu chưa login thì ghi `browser_login_required`, không bấm đăng thật.
  - Shopee Go Live 2026-05-08 đã có trang `shopee-review.html` cho tài khoản `shopee_reviewer`: sau login vào thẳng Review Mode, đọc capability/video/webhook live, mở được `dashboard_video`, và role reviewer bị chặn mọi lệnh ghi bằng `403`.
  - Production 2026-05-08 đã kiểm Chrome local cho shop chưa API: job test `chihuy2309` mở Chrome thật tới Seller Center bằng port `9354`, ghi `browser_login_required` khi profile chưa đăng nhập; UI đã sửa để sau khi tạo chiến dịch đa shop có job Chrome thì tự mở tab helper ngay, tránh tạo job xong mà không thấy trình duyệt.
  - Sau khi đăng nhập Seller Center, job test `vup_4ad4a9b0-bafc-4875-87ec-9014de155605` chạy tiếp tới `browser_preview_ready`: Shopee hiển thị file đã tải thành công, tiêu đề đã điền và dừng ở màn có `Đăng` / `Lưu bản nháp`; chưa tự gắn sản phẩm vì cần bổ sung bước mở modal sản phẩm.
  - Helper Chrome local 2026-05-08 ?? d?ng catalog snapshot ??ng shop ?? t?m s?n ph?m: job test `vup_90072cfd-0a62-476a-bf1b-35085c56212e` t? m? popup `Th?m s?n ph?m`, t?m b?ng `product_name`, tick d?ng K256, b?m `X?c nh?n`, tick ?i?u kho?n v? d?ng ? preview v?i n?t `??ng` b?t; job test ?? h?y trong backend, kh?ng b?m ??ng th?t.
  - Lazada Media Center 2026-05-08 đã nối vào `video_analytics_core`: capability Lazada có API trả `video_sync_mode=lazada_media_api`, route đọc quota `/api/video/lazada/quota`, tra video `/api/video/lazada/detail`, upload ảnh cover `/api/video/lazada/image-upload`, upload video block `/api/video/lazada/upload`, xóa video có chuỗi xác nhận `/api/video/lazada/remove`.
  - UI `dashboard_video.html` có tab `Lazada video`: chọn shop Lazada, đọc quota, upload cover, upload video thật vào Media Center, tra trạng thái bằng `video_id`, đọc `Kho video Lazada đã lưu` từ D1/R2 và xóa một video có xác nhận.
  - Advanced API center đã thêm module/permission `Lazada Media Center video` với các endpoint `/media/video/quota/get`, `/media/video/get`, `/media/video/block/create`, `/media/video/block/upload`, `/media/video/block/commit`, `/media/video/remove`, `/image/upload`.
  - Production 2026-05-09 đã bổ sung `Kho video Shopee`: `/api/video/sync` kéo thư viện theo cụm trang bằng `/api/v2/video/get_video_list`, không xóa cache nếu chưa quét đủ; `/api/video/delete` chia lô tối đa `5` video/lần theo chuẩn `/api/v2/video/delete_video`, bắt buộc xác nhận `XOA VIDEO`, có `dry_run`. UI lọc được `203` video có tiêu đề “Bấm vào giỏ hàng để mua” trên shop `chihuy1984`, tải lại toàn bộ lưu/cập nhật `315` dòng và chưa xóa video thật khi kiểm thử.
  - UI `Kho video Shopee` 2026-05-09 đã bổ sung thanh tiến trình tải thư viện theo trang/số video đã quét, báo tổng video Shopee trả về, số dòng đã lưu/cập nhật và warning. Xóa video chuyển từ nhập chữ sang modal xác nhận có bảng video; frontend tự chia lô tối đa `100` video/lần, backend vẫn chia tiếp `5` id/lệnh theo chuẩn Shopee. Đã kiểm production với shop `chihuy1984`: tải được `308/308` video đã đăng, lưu/cập nhật `315` dòng, modal xóa không còn yêu cầu nhập `XOA VIDEO`.
  - Production 2026-05-09 đã tách cache Shopee Video rõ `Đã đăng` và `Bản nháp`: backend bỏ các dòng `status=200` lẫn trong list `post`, chỉ lưu `status=300` là video đã đăng thật; D1 shop `chihuy1984` còn `281` video đã đăng, `7` bản nháp, `21` dòng đã xóa/cache xóa và `176` tiêu đề cũ cần xử lý. UI hiển thị nơi lấy video đã lưu ngay trong tab `Video đã đăng/Bản nháp`.
  - Production 2026-05-09 đã nối rõ Lazada video vào UI vận hành: `GET /api/video/library?platform=lazada` đọc kho đã lưu, `GET /api/video/lazada/quota` hiển thị quota thật, `POST /api/video/lazada/remove` có `dry_run` và chỉ xóa thật khi có `XOA_VIDEO_LAZADA`; UI đã kiểm trên shop `kinhdoanhonlinegiasoc@gmail.com`.
  - Production 2026-05-09 đã nối Shopee `Media` public và `MediaSpace` shop-token vào backend/UI vận hành: `GET /api/video/shopee/media-endpoints` kiểm readiness, `POST /api/video/shopee/media-space/image-upload` và `POST /api/video/shopee/media-space/upload` có `dry_run` + guard `XAC_NHAN_UPLOAD_MEDIA_SHOPEE`; UI `Shop / API` hiển thị `Shopee Media`, `Shopee MediaSpace`, `Media video: Đã nối`, `MediaSpace sản phẩm: Đã nối` cho shop đủ API.
  - Production 2026-05-10 đã rà live Open Platform nhóm Shopee Video/Media: đăng video đi `media init/upload/complete/result` -> `video get_cover_list` -> `edit_video_info` -> `post_video`; `delete_video` phân biệt draft bằng `video_upload_id_list` và video đã đăng bằng `post_id_list`; `edit_video_info` chỉ dùng trước khi video được post.
  - Production 2026-05-10 đã sửa token Shopee Video hết hạn làm UI khóa sai: `/api/video/capabilities`, `/api/video/shopee/media-endpoints` và các call Video API tự refresh khi còn `video_refresh_token`; `chihuy1984` và `chihuy2309` đã refresh live về `video_ready=1`, `video_sync_mode=api_live`.
  - Production 2026-05-10 đã khóa sửa tiêu đề/cover/sản phẩm đối với video Shopee đã đăng: UI không còn nút `Lưu thông tin video` cho `status=300/list_type=post`, backend `/api/video/edit` trả `blocked` ở dry-run hoặc lỗi rõ ở lệnh thật; bản nháp vẫn được sửa.
  - Production 2026-05-10 đã siết kết quả ghi Shopee Video: `edit_video_info` và `post_video` kiểm `success_list/failure_list`; xóa video đã đăng dry-run trả đúng `post_ids`, draft dùng `video_upload_ids`. Đã kiểm live không gửi lệnh thật bằng dry-run và mở UI production/mobile.
- `Đang làm dở`
  - Siết thêm phân quyền duyệt nhiều cấp nếu cần tách riêng người tạo lịch và người duyệt đăng thật.
  - Lazada mới có media/upload/detail/quota/remove và kho cache D1; chưa có endpoint analytics/list/trend/audience như Shopee Video trong tài liệu đã rà.
- `Chưa làm`
  - Nối `video_id` Lazada vào luồng tạo/sửa sản phẩm có preview payload riêng.
- `Bị chặn bởi quyền/app`
  - Shopee cần app/category `Shopee Video Management` và user chính đủ quyền

### Checklist phase tiếp theo

- [x] Tạo trung tâm video Shopee
- [x] Tách shop có API và không có API
- [x] Tách auth/app Shopee Video riêng và gate `Test quyền video`
- [x] Authorize live Shopee Video cho `chihuy1984`, lưu token video và test quyền OK
- [x] Đồng bộ đọc an toàn video thật cho `chihuy1984` và xác nhận dashboard đọc cache đúng shop
- [x] Rút gọn giao diện mobile bằng tab con theo nhóm thao tác
- [x] Đổi thư viện video sang bảng vận hành giống Seller Center, có phân trang nhẹ
- [x] Tạo hàng đợi upload video theo giờ, có preview/log/role guard
- [x] Rút gọn tab Phân tích/Chi tiết/Upload/Lịch upload sang bảng số liệu, có lọc theo lượt xem/doanh số/đơn đặt
- [x] Gộp đăng ngay và hẹn giờ vào một tab `Đăng video`
- [x] Sửa insight video/SKU có nút thao tác và fallback dữ liệu khi snapshot thiếu hiệu suất
- [x] Sửa KPI tổng tab Phân tích fallback từ Trend và xử lý demographics rỗng
- [x] Gọn bảng `Video theo hiệu quả`, clamp tiêu đề và sửa pill tín hiệu
- [x] Thêm AI gợi ý tiêu đề video có guard giữ đúng loại sản phẩm
- [x] Đọc metadata file để kiểm thời lượng Shopee Video `1-180 giây` trước upload
- [x] Bắt buộc hashtag `#shophuyvan` trong tiêu đề video và cảnh báo video đã đăng trùng trước upload
- [x] Đa shop hỗ trợ shop chưa API bằng luồng đăng tay có copy nội dung, link Creator Center và action log riêng
- [x] Thêm AI sửa tiêu đề trong tab `Chi tiết`, tự giữ `#shophuyvan` và sửa lỗi lưu video trả JSON thay vì `Failed to fetch`
- [x] Vá cache core sau khi sửa video thành công để reload dashboard/detail không quay lại tiêu đề cũ
- [x] Chặn/fallback cover rác khi sửa video để hết lỗi Shopee `cover 0 is illegal`
- [x] Khóa cover theo đúng `video_upload_id` khi sửa liên tiếp nhiều video trong tab `Chi tiết`
- [x] Tạo luồng `Đa shop`: campaign video dùng chung file R2, mỗi shop một queue job và có preview guard trước khi tạo lịch
- [x] Tạo job Chrome local cho shop Shopee chưa API, dừng ở preview và có nút xác nhận `Đã đăng tay`
- [x] Tạo Shopee Review Mode cho Go Live, có URL live riêng và tài khoản reviewer chỉ đọc
- [x] Tự mở tab helper Chrome local ngay sau khi tạo chiến dịch đa shop có shop chưa API
- [x] Vá guard thời lượng file trong luồng `Đa shop`: metadata hợp lệ không còn bị lưu nhầm vào biến lỗi nên nút tạo lịch không chặn sai sau khi UI đã đọc `File hợp lệ`
- [x] Build `Lazada Media Center` upload/library/quota/detail vào core video chung
- [x] Thêm upload ảnh cover Lazada qua `/image/upload` và upload video block qua `/media/video/block/*`
- [x] Khóa xóa video Lazada bằng chuỗi xác nhận riêng, không mở batch xóa trên UI
- [x] Nối tab `Lazada video` với kho D1/R2, tra lại theo `video_id`, đọc quota thật và dry-run xóa an toàn
- [x] Nối Shopee `Media` và `MediaSpace` vào Trung tâm video, có route kiểm endpoint, dry-run upload và guard xác nhận trước lệnh thật
- [x] Hiển thị tiến trình tải lại thư viện Shopee và đổi xóa video sang modal xác nhận không cần nhập chữ
- [x] Tự refresh token Shopee Video khi còn refresh token, tránh khóa nhầm shop đã có API Video
- [x] Khóa sửa thông tin video đã đăng theo giới hạn `edit_video_info`, chỉ cho sửa bản nháp/chưa đăng
- [x] Kiểm `success_list/failure_list` khi sửa/đăng video để không báo thành công giả
- [x] Luồng `Đa shop` gắn sản phẩm bằng tìm SKU/tên trong catalog riêng đúng shop; không lấy link/item của shop khác
- [ ] Hoàn thiện helper Chrome local tự mở modal gắn sản phẩm rồi tìm item trước khi dừng preview
- [ ] Nối video vào tạo/sửa sản phẩm Lazada
- [ ] Tìm endpoint Lazada analytics/list nếu Open Platform bổ sung sau này
- [x] Ghi chú tiếng Việt trong UI cho từng chế độ shop video

---

## 5. Chat, IM, hội thoại, auto-reply

### Module endpoint liên quan

**Shopee**
- sellerchat/webchat nội bộ đang dùng trong repo
- chưa có full docs public buyer-seller chat tương đương Lazada

**Lazada**
- `Instant Messaging API`

### Tính năng có thể làm

- Lấy danh sách hội thoại
- Lấy nội dung tin nhắn
- Gửi text
- Đánh dấu đã đọc
- Mở hội thoại từ đơn
- Thu hồi tin
- Gửi ảnh/video khi endpoint hỗ trợ
- Push tin nhắn mới
- Gộp alias hội thoại cũ/mới về một `canonical_conversation_id`

### Luồng shop có API

- `chat_transport_core` quyết định đi API trước
- `chat_identity_core` chống trùng hội thoại

### Luồng shop không có API

- `browser_scan_policy_core`
- quét 2 tầng: ngoài danh sách trước, mở sâu khi cần
- `manual_reference` nếu không đủ dữ liệu

### Trạng thái hiện tại

- `Đã xong`
  - tách capability matrix API / không API
  - ổn định lại load chat live
  - vào trang chat không còn chờ cứng `/api/chat/shops`; nếu setup shop chậm thì danh sách hội thoại vẫn lên trước và UI báo rõ đang tải nền
  - sửa cold start F5 cho `settings / conversations / shops` bằng marker schema D1; bỏ summary nặng mặc định ở route conversations
  - tách `AI & Luật / Mẫu AI / Từ khóa / Lưu ý SP / Tự động hóa` ra khu `Cài đặt chat` riêng; panel phải chỉ còn `Đơn hàng / Sản phẩm / Voucher`
  - sửa các text lỗi dấu ở `Cài đặt chat`, nút automation và trạng thái guard trên production
  - tab `Sản phẩm` hiện đúng link sản phẩm thật của shop/sàn đang chat và nút `Chèn link`
  - `Lưu ý SP` không còn dùng link lưu chết; khi chèn/gửi sẽ resolve lại sản phẩm theo `platform + shop + item_id/SKU` từ catalog đã đồng bộ
  - AI guard chặn cứng tên sàn/tên shop nội bộ (`Shopee / Lazada / TikTok / Shop Huy Van`) ở cả UI settings lẫn runtime `/api/chat/guard`
  - AI draft ép trả đúng câu từ chối khi khách xin địa chỉ, Zalo, số điện thoại hoặc thông tin liên hệ của shop; rule này hiện rõ trong tab `AI & Luật`
  - backend Lazada chat đã tách riêng callback `/channels/lazada/chat/callback`, route tạo link `/api/auth/lazada/chat/url` và bộ token `chat_access_token` không còn ghi đè token Lazada chính
  - core chat production chỉ coi `chat_access_token` là nguồn chuẩn cho Lazada IM; shop Lazada chỉ có app chính sẽ hiện `browser` thay vì giả như API chat đã sẵn sàng
  - app chat Lazada riêng đã authorize xong; production có `chat_access_token`, `transport=api`, `chat_api_status=ready`
  - `POST /api/chat/api-sync` production đã kéo thật `10` session và `49` message Lazada qua `/im/session/list` + `/im/message/list`
  - đã bỏ hoàn toàn Chrome/local automation cho chat Lazada; helper local `/chat-sync`, `/chat-send`, `/chat-warm` đều trả `lazada_automation_removed`
- script `E:/shophuyvan-python-automation/oms_python/features/chat/automation_browser.py` đã xóa hẳn nhánh DOM collector Lazada; chỉ còn Shopee/TikTok dùng helper Chrome
  - core transport ép Lazada chỉ còn `api` hoặc `off`; nếu DB còn cờ `browser` cũ thì tự khóa về `off`, không cho fallback Chrome
  - `POST /api/chat/read` production đã gọi thật `/im/session/read` thành công cho session Lazada chính thức
  - `POST /api/chat/send` production đã kiểm `dry_run` thành công với payload `/im/message/send`; chưa gửi live cho khách thật để tránh tạo tin nhắn test ngoài ý muốn
- UI production đã đổi rõ phạm vi automation thành `Shopee hoặc TikTok chưa có API chat chính thức`; nút vận hành chỉ còn `Mở Chrome Shopee/TikTok` và `Chạy automation Shopee/TikTok`
- tab `Sản phẩm` trong chat đã có ô tìm trực tiếp theo `SKU / item_id / tên` qua `/api/chat/products` và nút `Đồng bộ sản phẩm` gọi lại `/api/products/sync-api-products` cho đúng `platform + shop` của hội thoại đang mở
- đã vá lỗi poll nền làm mất ô tìm kiếm/tab sản phẩm: refresh cùng hội thoại không còn reset state tìm catalog giữa lúc CSKH đang lọc sản phẩm
  - danh sách hội thoại Lazada đã ưu tiên session IM chính thức khi cùng `canonical_conversation_id`; alias cũ không còn lấn dòng chính thức như trước
  - kiểm trên web production mobile `390px`: filter `Lazada` hiện `17 hội thoại`; mở thread `Rick` đọc được nội dung `[weary]`
- tab `Đơn hàng` trong chat đã có nguồn dữ liệu rõ `Đơn hàng API / Tham chiếu OMS`, nút `Đồng bộ đơn hàng` chỉ mở cho shop có API và chia thẻ `Đơn khớp chắc / Đơn khớp mềm, cần kiểm tra`
- sync đơn hàng trong chat đã đi đúng luồng `platform + shop` qua `/api/advanced/features` (worker vẫn giữ alias `/api/features` để không vỡ frontend/cache cũ); shop không API chỉ đọc OMS hiện có, không gắn nhãn đồng bộ API
- tab `Đơn hàng` trong chat nay tự lấy lại `tên khách thật` từ message buyer khi row hội thoại API bị lưu `buyer_name=b buyer_id số`; production case `tangtu1992` đã hiện đúng `Đơn khớp mềm, cần kiểm tra` với đơn `260507R23466HH`
- AI draft production đã có timeout riêng từng key Gemini, xoay key khi chậm/lỗi, chỉ thử tối đa `3` key mỗi lượt và rút gọn context prompt để không treo dây chuyền quá lâu
- frontend chat đã nâng timeout `/api/chat/ai-draft` lên `40s` và hiển thị rõ khi đang dùng `local-fallback` nội bộ, không để CSKH hiểu nhầm là AI vẫn đang chạy bình thường
- `Kết nối & Đồng bộ` production đã tách riêng `Lazada API chính` và `Lazada Chat API`; cùng một dòng Lazada hiện rõ hạn token từng app và nút `Gia hạn Lazada / Gia hạn chat / Đồng bộ chat / Ngắt chat`
- `/api/shops/api-configs` đã trả thêm `has_chat_access_token`, `has_chat_refresh_token`, `chat_token_expire_at`, `chat_api_connected_at`, `chat_api_refresh_expire_at` để UI vận hành đọc đúng trạng thái app chat Lazada
- `Cài đặt chat` production đã có khối `Lazada Chat API` trong từng shop Lazada, hiển thị rõ `đã kết nối / sắp hết hạn / đã hết hạn` và nút `Kết nối lại Chat API`
- nút `Đồng bộ chat` trong `Cài đặt chat` đã chạy production thật và giữ lại thông báo kết quả sau khi modal refresh, không bị trả về câu nhắc mặc định ngay lập tức
- production đã dọn sạch dữ liệu rác chat Shopee: xóa `Shopee gom ... tin tự động`, cụm FAQ `Chat với Người bán`, `new_faq` và prompt đa ngôn ngữ chứa `{placeholder}` để OMS chỉ còn tin chat thật
- webhook/sync Shopee nay chặn từ lõi các row hệ thống `bundle_message / faq / review prompt`; reprocess `120` webhook gần nhất không tái sinh lại dữ liệu rác
- kiểm production bằng Chrome thật qua CDP ở 2 hội thoại lỗi `tangtu1992` và `mumcuacun`: không còn thấy `Shopee gom ...`, `Chat với Người bán`, `Shopee Coins`, `{placeholder}` trong preview hoặc luồng chat
- nút `💬 Nhắn khách` từ OMS đã đi qua backend resolver chung; nếu đã có thread thì mở đúng hội thoại, nếu chưa có thread thì seed hội thoại mới từ đơn hàng và prefill câu mở đầu để CSKH xử lý ngay
- kiểm production bằng Chrome thật qua CDP ở 2 nhánh `Nhắn khách`:
  - `hard match`: đơn `260507R23466HH` mở đúng hội thoại `tangtu1992`, prefill đúng theo đơn
  - `created`: đơn `260507RDRRDHK4` seed hội thoại `automation-shopee-seed-or6a3c`, guard hiện rõ cảnh báo fallback automation local nếu Shopee chưa có `buyer_id`
- chat mobile đã sửa lỗi polling nền tự bật khỏi hội thoại về danh sách sau vài giây; khi đang mở thread, danh sách được làm mới nhưng thread không bị render rỗng
- trên mobile, nút `Chèn trạng thái đơn` trong tab `Đơn hàng` tự đóng panel đơn hàng, đưa focus về ô trả lời và nhắc kiểm tra trước khi bấm `Gửi`
- tab `Đơn hàng` trong chat đã thêm nút `Theo dõi vận chuyển` ngay trên từng đơn: Shopee có API gọi endpoint đọc `get_tracking_info`, còn Lazada/TikTok/shop không API hiển thị hành trình từ OMS và ghi rõ nguồn dữ liệu
- guard chat đã bỏ qua mã vận đơn có tiền tố sàn/ĐVVC như `SPXVN...`, `LMP...`, `LEX...` khi quét số điện thoại, đồng thời sửa luật chữ ngắn như `huỷ` để không khớp nhầm bên trong chữ `chuyển`
- `Làm mới tin nhắn` và polling nền đã reload lại hội thoại đang mở thay vì chỉ reload khi backend báo có số tin mới; nếu hội thoại thuộc shop Shopee/TikTok fallback thì nút làm mới sẽ gọi helper Chrome có kiểm soát
- OMS đã bổ sung bước `Bàn giao ĐVVC` sau `Đã đóng gói`; shop không API dùng đây là xác nhận tay để chuyển đơn sang `Đang giao`, shop có API vẫn được đối soát lại bằng `sync-api-status`
- `Quét trạng thái` đã khôi phục hướng tự động: nếu API/Radar đọc được đơn đã rời kho (`đã giao cho vận chuyển`, `đã vận chuyển`, `đang giao`, `shipped`) thì core import tự cập nhật `SHIPPING / SHIPPED`; nút `Bàn giao ĐVVC` chỉ là fallback khi không quét được sàn.
- production D1 ngày 2026-05-08 còn `53` đơn Shopee ở `PENDING / LOGISTICS_PACKAGED`; nhóm `manual_reference` không tự sync API, không chuyển hàng loạt nếu chưa xác nhận đã giao cho ĐVVC thật
- AI auto-reply phase 2 đã có runner backend `runChatAiAutoReplyBatch`, cron 5 phút, route `POST /api/chat/auto-reply/run`, log `marketplace_chat_ai_auto_reply_logs`, công tắc `off / dry_run / live`, khóa shop canary và khóa chỉ xử lý tin mới tối đa `2` giờ; production hiện bật `live` riêng Shopee shop `chihuy2309`, limit `1`.
- Tab `AI & Luật` đã có khối `AI tự trả lời`: chọn Shopee/Lazada, nhập shop canary được phép live, giới hạn số hội thoại mỗi lượt, thời gian chờ khách nhắn xong, giới hạn tuổi tin mới theo giờ, câu giữ nhịp khi cần nhân viên duyệt, nút chạy thử và log auto.
- Nút `Gửi` trong chat đã sửa lỗi frontend gán lại `const text`; production đã kiểm JS mới `chat-send-fix-20260510` gọi được `/api/chat/guard` và `/api/chat/send`. Cập nhật mới: `chihuy2309` vẫn là shop API và vẫn gửi API trước; riêng hội thoại seed OMS thiếu `buyer_id` như `phuongto.rt / chihuy2309` được phép fallback helper local sau khi API trả `missing_buyer_id`, để xử lý nút `Nhắn khách` từ đơn hàng không bị kẹt.
- Rà endpoint chat 2026-05-10: Lazada raw docs có đủ 7 endpoint IM; repo đã nối `session/list`, `message/list`, `message/send` text và `session/read`, còn thiếu `session/get`, `session/open`, `message/recall` và template media/thẻ/voucher. Shopee Open Platform khi kiểm trực tiếp bằng profile tài liệu đã thấy 18 endpoint Customer Service App thuộc nhóm `v2.sellerchat.*`, nhưng chi tiết `doc/api` đang bị `error_auth`; local reference đã cập nhật tên endpoint, còn request/response vẫn khóa quyền nên tiếp tục giữ `guarded_internal`.
- UI Chat sàn 2026-05-10 đã sửa responsive shell trên mobile/tablet/desktop: list view và thread view đều khóa trong `100dvh`, từng panel tự cuộn, mobile 390/430 và tablet 768 không tràn ngang/dọc, desktop 1366 không còn cắt ô gửi trong panel. Đây là sửa giao diện, không thay đổi endpoint hoặc quyền API.
- Refactor Chat sàn 2026-05-13 đã đổi cấu trúc code theo tính năng: frontend dùng `apps/fe/js/dashboard/fe-chat-marketplace-loader.js` + `fe-chat-*`, backend dùng `apps/worker-api/src/routes/worker-chat-marketplace-route.js` + `worker-chat-*`; không còn module chat nghiệp vụ tên `part-*.js`, không còn tên file trùng giữa frontend/backend, và tất cả file chat hiện hành dưới `30KB`.
- Chat context 2026-05-13 đã thêm `reference_orders` cùng shop khi chưa khớp được đơn chắc/mềm, để CSKH vẫn thấy dữ liệu OMS/API tham chiếu nhưng không bị gắn nhãn nhầm là đơn của khách.
- Luồng sản phẩm chat 2026-05-13 giữ đúng `platform + shop`: shop có API bấm đồng bộ qua `/api/products/sync-api-products`; nếu API lỗi mạng/token thì UI fallback sang catalog OMS đã lưu của đúng shop qua `/api/chat/products`, không mượn catalog shop khác và không để panel trắng.
- Context chat 2026-05-13 đã giảm payload catalog nhúng để Chrome không còn `Failed to fetch`; dữ liệu chi tiết/tìm sâu đi qua `/api/chat/products`, còn UI/worker lọc dữ liệu bẩn `// NEO:` trước khi hiển thị thẻ đơn cho CSKH.
- Chat/CSKH Core riêng 2026-05-18 đã tạo phase 1-5 song song: `apps/chat-worker-api` cho Worker `shophuyvan-chat-api`, schema chuẩn `docs/chat-core-schema.md`, map legacy `docs/chat-refactor-map.md`, route tối thiểu `/api/chat/conversations`, `/api/chat/conversations/:id/messages`, `/api/chat/messages/send`, `/api/chat/sync`, `/api/chat/ai/suggest`, `/api/chat/settings`, và UI mới `apps/fe/pages/chat-cskh.html`.
- Luồng gửi mới 2026-05-18 lưu outbound ngay trạng thái `sending`, frontend append message shop bằng `client_temp_id` trước khi gọi API, response merge lại theo `client_temp_id`; nếu Shopee adapter chưa cấu hình endpoint chính thức thì message chuyển `failed` và hiện nút gửi lại, không cần bấm làm mới và không fake success.
- Kiểm 2026-05-18 sau khi chốt deploy mono-repo: `node --check` pass cho 32 JS mới trong `apps/chat-worker-api/src` và `apps/fe/js/dashboard/chat`, `npm test` trong `apps/chat-worker-api` pass, `wrangler whoami` đúng account `39cf0fe9b3eda88bda53e369770cabeb`, dry-run chỉ thấy D1/R2 Chat riêng.
- Production Chat Worker đã deploy riêng: `shophuyvan-chat-api` tại `https://shophuyvan-chat-api.zacha030596.workers.dev`, version mới nhất `48b6741d-70b3-48ae-9332-9561ee0ab39d`; `/api/chat/health` pass mode `d1`, `/api/chat/conversations` pass, safe send Shopee thiếu bridge chuyển `failed` với `adapter_not_configured` và sync không tạo duplicate.
- Production UI đã deploy static từ `apps/fe`, URL `https://shophuyvan-analytics.nghiemchihuy.workers.dev/pages/chat-cskh.html`, version mới nhất `1d776058-82ed-4d25-ab55-17ddc9fe8d41`; kiểm bằng Chrome profile `E:\codex-chrome-profiles\shophuyvan-test` pass mobile `390x844`, tablet `820x1180`, desktop `1366x900`: API base đúng Chat Worker, đủ badge capability, mở thread, gửi safe message `sending -> failed`, có `Gửi lại`, sync không duplicate, không tràn ngang. Đã dọn test data prefix `codex_cap_` khỏi D1.
- 2026-05-25 Chat/CSKH realtime: static UI deploy `2f2119a7-5dde-4583-9885-6a444d6b8096`, Chat Worker `378b2d46-ae15-4057-a4ef-f7a38dcf9c63`. Endpoint chính thức giữ Shopee SellerChat `/api/v2/sellerchat/get_conversation_list`, `/api/v2/sellerchat/get_message`, `/api/v2/sellerchat/send_message`; Lazada IM `/im/session/list`, `/im/message/list`, `/im/message/send`. UI poll shop API theo `poll_seconds=12`, helper no-API chỉ chạy exact `khogiadungcona`/`0909128999`, Chrome visible/headful đúng profile, không mở shop API bằng helper. Production UI mobile/tablet/desktop pass, không tràn ngang, tiếng Việt cũ được normalize.
- Capability Chat/CSKH 2026-05-18 đã chuẩn hóa trong Chat Core chung: mỗi conversation có `shop_chat_mode`, `send_capability`, `sync_capability`; shop có API đi official API/bridge khi đủ quyền, shop không API chỉ được `browser_helper`, `manual` hoặc `disabled`. UI mới render badge `API chính thức`, `Bridge`, `Browser helper`, `Gửi tay`, `Chưa cấu hình`; backend không ghi `sent` nếu chưa gửi lên sàn mà chuyển `failed`, `manual_pending` hoặc `queued_for_browser_helper`. Production đã kiểm đủ mode `official_api/bridge` thiếu cấu hình, `manual`, `browser_helper`, `disabled`.
- `Đang làm dở`
  - gửi text live Lazada qua OMS bằng IM API thật sau khi chốt câu test an toàn
  - nối endpoint cầu Shopee chính thức `SHOPEE_CHAT_BRIDGE_URL` nếu muốn gửi live ra sàn
  - alias/canonical hóa hội thoại sâu hơn cho các thread Lazada chỉ còn dữ liệu `automation-*` mà IM API chưa trả session chính thức
  - làm sạch dứt điểm dữ liệu lịch sử Lazada cũ đang giữ preview/message auto chào dài hoặc buyer_id sai
- `Bị chặn bởi tài liệu/quyền`
  - Shopee chat ghi thật nhiều thao tác nhạy cảm

### Checklist phase tiếp theo

- [x] Tách luồng shop API / không API
- [x] Ổn định đường nóng chat live
- [x] Tách khu cài đặt chat thành tab con riêng
- [x] Khóa cứng AI không tự nhắc tên sàn / tên shop
- [x] Resolve link sản phẩm theo đúng `platform + shop` trước khi chèn/gửi
- [x] Ép câu trả lời cố định khi khách xin thông tin liên hệ của shop trên sàn
- [x] Tách app chat Lazada riêng: callback riêng, token riêng, transport chỉ đọc token chat riêng
- [x] Authorize app chat Lazada riêng và kéo session/message thật bằng IM API
- [x] Bỏ hoàn toàn automation local cho chat Lazada
- [x] Thêm tìm kiếm + đồng bộ sản phẩm ngay trong tab `Sản phẩm` của chat
- [x] Xóa nhánh helper Chrome Lazada trong script/browser local
- [x] Ép transport Lazada chỉ còn `api/off`, không nhận `browser` legacy
- [x] Kiểm thật `mark read` Lazada qua `/im/session/read`
- [x] Kiểm `dry_run` gửi text Lazada qua `/im/message/send`
- [x] Ưu tiên session IM chính thức của Lazada khi trùng `canonical_conversation_id`
- [x] Ổn định timeout AI draft: timeout từng key Gemini, xoay key, nới timeout web, cắt gọn context
- [x] Thêm tab `Đơn hàng` có nguồn dữ liệu rõ, nút `Đồng bộ đơn hàng` và phân nhóm `Đơn khớp chắc / Đơn khớp mềm`
- [x] Tách UI quản trị `Lazada API chính` và `Lazada Chat API` trong `Kết nối & Đồng bộ` và `Cài đặt chat`
- [x] Dọn dữ liệu rác chat Shopee và chặn tái sinh từ webhook/sync
- [x] Đổi `calcProfit()` legacy và route cũ sang chung source of truth phase 1
- [x] Nút `Nhắn khách` từ OMS mở đúng hội thoại hoặc seed hội thoại mới khi chưa có thread
- [x] Sửa mobile chat không tự thoát hội thoại và chèn tin từ đơn hàng quay về ô gửi
- [x] Thêm `Theo dõi vận chuyển` ngay trong thẻ đơn chat và tự reload hội thoại đang mở theo polling
- [x] Thêm bước `Bàn giao ĐVVC` để xử lý đơn tồn ở `Đã đóng gói`
- [x] Phase 2 `AI auto-reply thật` có runner, guard, log và công tắc `dry_run/live`
- [x] Sửa responsive Chat sàn trên mobile/tablet/desktop, kiểm production bằng profile `ProductionAdminTest`
- [x] Tách file Chat sàn theo tính năng, đổi tên frontend/backend không trùng nhau và giữ từng file dưới `30KB`
- [x] Sửa lỗi gửi chat `assessChatContent is not defined` và bổ sung fallback catalog đúng shop khi đồng bộ sản phẩm lỗi
- [x] Tạo Chat/CSKH Core riêng phase 1-5 và UI optimistic send không cần refresh ở môi trường local
- [x] Deploy Chat Worker riêng `shophuyvan-chat-api` bằng Cloudflare profile Chat, không deploy Worker chính
- [ ] Hoàn thiện `chat_identity_core`
- [x] Deploy/route UI production `chat-cskh.html` và kiểm mobile/tablet/PC
- [ ] Hoàn thiện `chat_conversation_aliases`
- [ ] Gửi text live Lazada từ OMS với câu test an toàn đã chốt
- [x] Canary live đầu tiên: Shopee shop `chihuy2309`, limit `1`, chỉ xử lý tin mới tối đa `2` giờ
- [ ] Theo dõi log canary vài vòng trước khi mở rộng shop hoặc tăng limit
- [ ] Chỉ mở rộng Shopee chat khi đủ docs/quyền
- [ ] Lưu rõ “shop API làm được gì / shop không API chưa làm được gì”

---

## 6. Khuyến mãi, voucher, freeshipping, combo, flash sale

### Module endpoint liên quan

**Shopee**
- `Discount`
- `Voucher`
- `Bundle Deal`
- `Add-On Deal`
- `ShopFlashSale`
- `TopPicks`

**Lazada**
- `Seller Voucher API`
- `Free Shipping API`
- `Flexicombo API`
- `Early Bird Price API`

### Tính năng có thể làm

- Tạo/sửa/kích hoạt/tắt voucher
- Tạo/sửa freeshipping
- Tạo/sửa combo / bundle / add-on
- Quản lý SKU nằm trong rule khuyến mãi
- Phân tích SKU nào đang bị promo chồng với ads / discount
- Đồng bộ rule khuyến mãi vào phân tích lợi nhuận

### Luồng shop có API

- Dùng `promotion_tool_core` để đọc cache khuyến mãi chung.
- Shopee có API: `Discount`, `Voucher`, `Bundle Deal`, `Add-On Deal`, `ShopFlashSale` đã có sync read-only, lưu vào D1; Discount là luồng duy nhất đang được phép execute thật qua queue khi diagnostics pass và `SHOPEE_LIVE_WRITE_ENABLED=true`. Voucher/Bundle/Add-On/Flash Sale chỉ được xem là có client/endpoint nền, chưa mở UI ghi thật nếu chưa có marketplace_client diagnostics + refetch verify.
- Lazada có API: `Seller Voucher API`, `Free Shipping API`, `Flexicombo API` đã có sync read-only, lưu vào D1; Flexicombo production hiện chưa có chương trình phát sinh.

### Luồng shop không có API

- Chỉ dùng dữ liệu tham chiếu từ đơn/report/import/browser có log.
- Không gắn nhãn “đồng bộ API” hoặc “tạo voucher bằng Open Platform” cho shop chưa có API.

### Trạng thái hiện tại

- `Đã xong`
  - 2026-05-24 tách UI Khuyến mãi sàn khỏi ADS: `apps/fe/pages/promotions.html` có đủ 8 module vận hành; ADS chỉ còn tham chiếu ảnh hưởng khuyến mãi tới hiệu quả quảng cáo.
  - 2026-05-24 thêm route read-model người dùng `/api/discounts/promotion-module-read-model`, đọc `marketplace_discounts`, `marketplace_discount_items`, `marketplace_vouchers`, `marketplace_promotion_programs`, `marketplace_promotion_items`; raw payload không render ra UI.
  - 2026-05-24 đã kiểm LazOP chính thức: Seller Voucher có `/promotion/voucher/create`, `/promotion/voucher/update`, `/promotion/voucher/get`, `/promotion/vouchers/get`, `/promotion/voucher/activate`, `/promotion/voucher/deactivate`, `/promotion/voucher/products/get`, `/promotion/voucher/product/sku/add`, `/promotion/voucher/product/sku/remove`; Free Shipping có create/update/get/list/activate/deactivate/products/regions/add/remove SKU; Flexicombo có create/details/update/list. Code hiện vẫn khóa live-write Lazada cho tới khi có adapter payload, quyền app và readback sample.
  - tạo `promotion_tool_core` đọc/tổng hợp tại `/api/discounts/promotion-tool-core`
  - Shopee Discount đã có sync read-only, phân tích ADS/tồn và action guard an toàn ở `/api/discounts/shopee/*`
  - Shopee Discount 2026-05-10 đã mở đẩy giá thật qua `update_discount_item`: UI bắt buộc hộp xác nhận OK/Cancel, backend bắt buộc quyền admin và dòng gộp nhiều phân loại vẫn bị chặn
  - Shopee Voucher đã có sync read-only tại `/api/discounts/shopee/vouchers/sync`, lưu cache `marketplace_vouchers`
  - Lazada Seller Voucher đã có sync read-only tại `/api/discounts/lazada/vouchers/sync`, lưu cache `marketplace_vouchers`
  - Shopee Bundle/Add-On/Flash Sale đã có sync read-only tại `/api/discounts/shopee/promotions/sync`, lưu cache `marketplace_promotion_programs` và `marketplace_promotion_items`
  - Lazada Free Shipping/Flexicombo đã có sync read-only tại `/api/discounts/lazada/promotions/sync`, lưu cache chương trình khuyến mãi chung
  - ADS page đã có panel/page con `Khuyến mãi sàn`: tải core, cập nhật cache read-only, hiển thị voucher/program/SKU đang giảm giá + ADS + tồn
  - UI `Khuyến mãi sàn` 2026-05-10 đã tách thành tab con `Tổng quan core`, `Cập nhật cache`, `Danh sách`, `Chi tiết / giá`, `Hàng đợi duyệt`; thêm nút `Cập nhật theo bộ lọc` để cập nhật read-only đúng nguồn/sàn/module/trạng thái đang chọn
  - UI `Khuyến mãi sàn` 2026-05-10 đã thêm tab `Tính năng`: hiển thị 9 nhóm Shopee/Lazada, nhưng từ 2026-05-15 các badge ghi thật phải được hạ về `Cần kiểm tra API`, `Read-only`, `Thiếu quyền` hoặc `Ghi thật có guard` cho tới khi có diagnostics Shopee thật.
  - UI `Khuyến mãi sàn` 2026-05-10 đã thêm lưới nút nhanh theo từng tính năng có thể cập nhật: Shopee Voucher/Bundle/Add-On/Flash, Lazada Voucher/Freeship/Flexicombo, toàn bộ read-only, batch sâu, làm sạch giá và hàng đợi nội bộ; từ 2026-05-15 các nút cache/preview phải ghi rõ đang đồng bộ API read-only hay chỉ kiểm payload.
  - UI danh sách chương trình đã tách `cache item/SKU` và `sàn báo` để không nhầm Flash Sale/Bundle/Add-On có số lượng từ list là đã có đủ item chi tiết trong cache
  - UI `Khuyến mãi sàn` đã có danh sách voucher/program, mở chi tiết chương trình và preview payload giá theo tồn kho ở chế độ khóa apply thật
  - `Khuyến mãi sàn` 2026-05-13 đã làm rõ tiếng Việt và thao tác vận hành: tab `Danh sách` hiện `Xóa cache` + nút trạng thái theo từng dòng, tab `Chi tiết / giá` có empty state rõ ràng, tab `Hàng đợi duyệt` đổi nhãn raw sang `Mua kèm deal · Quy tắc giá theo tồn kho`, và `promotion_tool_core` không còn dàn cùng một spend ADS vào mọi SKU khi campaign chưa map được SKU; phần chưa map được tách riêng `campaign ADS chưa map được SKU`.
  - Batch sâu thủ công `/api/discounts/promotion-cache/batch` và alias `/api/discounts/promotions/deep-sync` đã deploy; cron Worker chạy lát cắt nhỏ theo shop/module để cache sâu dần mà không vượt quota
  - `promotion-stock-price-rule-core` đã chuẩn hóa rule giá theo tồn kho dùng chung, trả payload preview và log action an toàn, chưa gửi lên sàn
  - Production đã kiểm trang thật: Shopee Bundle có 54 dòng list, mở được chương trình 5 item, preview trả `apply_locked=true`, mobile 390px không tràn ngang
  - route làm sạch cache `promotion-items/repair-prices` đã map giá/tồn từ `product_variations`; production đã cập nhật 5/8 dòng Shopee Bundle trong lượt kiểm
  - route chi tiết SKU `promotion-sku-detail` đã gom promotion + tồn + ADS + doanh thu + giá vốn để kiểm lãi trước khi duyệt
  - Refactor 2026-05-13 đã tách `discounts.js` thành wrapper và module theo `common`, `shopee/discounts`, `shopee/vouchers`, `shopee/promotions`, `lazada/vouchers`, `lazada/promotions`; toàn bộ file trong cụm này dưới 30KB, contract route cũ giữ nguyên.
  - Shopee Voucher/Bundle/Add-On/Flash Sale 2026-05-15 được audit lại: code có endpoint/client nền và preview, nhưng UI không được ghi đã mở ghi thật cho đến khi `marketplace_client` diagnostics pass, có quyền Marketing/Seller, có payload đủ item/model/timeslot và refetch verify sau POST.
  - hàng đợi nội bộ apply `promotions/queue-apply` và `promotions/apply-queue` đã có quyền admin, risk summary, rollback payload, `send_status`, `verify_status`, `client_type`, `shopee_endpoint` và log `sent_to_platform=false`
  - Lazada Early Bird đã chốt `preview_only_locked`: có preview endpoint ghi giá nhưng không mở apply thật
- `Đang làm dở`
  - cache sâu cho toàn bộ lịch sử promotion tiếp tục được lấp bằng cron lát cắt; chưa ép một lượt lớn để tránh quota Worker
  - một số item của Bundle/Add-On/Flash Sale vẫn chưa map được sang `product_variations`, trạng thái hàng đợi sẽ là `needs_data` cho tới khi bổ sung dữ liệu
  - Lazada Flexicombo gọi endpoint thành công nhưng production hiện trả `0` chương trình
- `Chưa làm`
  - màn hình duyệt hàng đợi nâng cao cho approve/reject nhiều dòng
- `Bị khóa an toàn`
  - Lazada freeshipping, flexicombo và Early Bird thật vẫn khóa ở tầng gửi sàn.
  - Shopee Voucher/Bundle/Add-On/Flash Sale bị khóa ghi thật trong UI nếu diagnostics chưa chứng minh app Marketplace/Marketing có quyền tương ứng. App Ads Service chỉ dùng cho ADS, không dùng để kết luận quyền promotion.
  - Shopee Discount có guard ghi thật nhưng vẫn bị `SHOPEE_LIVE_WRITE_ENABLED=false` chặn cho tới khi bật live write và thao tác test nhỏ được xác nhận.
  - UI mới không được ghi `Hoàn thành live-write` cho Voucher/Bundle/Add-On/Flash/Freeship/Flexicombo nếu chưa có live sample, readback match và revert an toàn.

### Checklist phase tiếp theo

- [x] Tạo `promotion_tool_core`
- [x] Nối Shopee Discount + Voucher read-only
- [x] Nối Lazada Seller Voucher read-only
- [x] Nối Shopee bundle/add-on/flash sale read-only
- [x] Nối Lazada freeshipping/flexicombo
- [x] Dashboard promo chồng chéo với ADS
- [x] Rule giá theo tồn kho dùng chung đa sàn ở mức core/preview khóa
- [x] Batch sâu/cron lát cắt cho voucher/program
- [x] UI drilldown voucher/program và preview payload ghi thật ở chế độ khóa
- [x] Làm sạch/mapping giá 0đ từ `product_variations`
- [x] Chi tiết SKU: promotion + ADS + tồn + doanh thu + giá vốn
- [x] Hàng đợi duyệt apply có quyền admin, risk summary và rollback payload
- [x] Chốt Lazada Early Bird ở chế độ preview-only khóa an toàn
- [x] Mở Shopee Discount `update_discount_item` có xác nhận OK và quyền admin
- [x] Mở bảng tính năng khuyến mãi đầy đủ và kiểm một lượt sync read-only các module
- [ ] Chạy diagnostics thật và mở lại adapter ghi thật Shopee Voucher/Bundle/Add-On/Flash Sale sau khi chứng minh quyền Marketplace/Marketing + refetch verify; hiện chỉ giữ client/endpoint/preview nền, không ghi UI là đã xong.

---

## 7. Payment, payout, finance, thuế

### Module endpoint liên quan

**Shopee**
- `Payment`

**Lazada**
- `LazPay API`
- `Finance API`

### Tính năng có thể làm

- Số dư doanh thu theo trạng thái
- Thu nhập theo đơn
- Billing / payout / statement / report
- Đối soát doanh thu đơn với payment
- Hỗ trợ báo cáo thuế, báo cáo tài chính vận hành

### Trạng thái hiện tại

- `Đã xong`
  - trang số dư doanh thu Shopee cơ bản
  - `order_finance_core` dùng chung order + payment đã deploy qua `/api/order-analytics/finance-core`
  - Snapshot D1 tài chính đã sẵn sàng cho báo cáo ngày/tháng
  - Adapter Lazada Finance/LazPay đã deploy: transaction detail lưu được vào `order_fee_details` khi app có quyền, payout status đọc được qua `/finance/payout/status/get`
  - OMS phase 1 đã khóa hiển thị `API-first`: shop có API ưu tiên bucket phí thật/tax thật từ `order_fee_details`, phần thiếu mới lấy `cost setting`; shop không API hiển thị `Phí cost setting`
  - `calcProfit()` legacy và route cũ đã đọc chung source of truth phase 1; OMS production kiểm thật còn hiển thị đúng cả `Phí API + ước tính` lẫn `Phí cost setting`
  - Tab `Lãi ròng` có bộ lọc đơn âm tiền theo dòng hàng, giúp xem SKU/sản phẩm/ảnh/giá vốn/CPO trước khi chốt báo cáo tài chính
- `Đang làm dở`
  - phân biệt rõ local / cross border
  - Lazada transaction detail bị chặn bởi quyền app production, nên chưa có dòng Lazada Finance thật ghi vào core
  - tiếp tục phân biệt sâu local / cross border và mở rộng bucket Lazada Finance khi quyền transaction detail production sẵn sàng
- `Chưa làm`
  - đối soát đơn hàng với payout/statement thật theo kỳ

### Checklist phase tiếp theo

- [x] Chuẩn hóa tiếng Việt và ghi chú Payment Shopee
- [x] Tạo `order_finance_core` dùng chung order + payment
- [x] Nối LazPay / Finance API vào core (adapter đã deploy; dữ liệu transaction detail đang chờ quyền app)
- [x] Khóa OMS `API-first` cho phí sàn và ghi rõ phần ước tính còn thiếu
- [x] Thêm tab con Top SKU và danh sách đơn âm tiền có sản phẩm/giá vốn/CPO
- [ ] Đối soát đơn hàng với payout thật
- [ ] Tạo báo cáo thuế theo kỳ

---

## 8. Review, đánh giá sản phẩm

### Module endpoint liên quan

**Shopee**
- `Product.get_comment`
- `Product.reply_comment` (endpoint ghi, đang khóa an toàn)

**Lazada**
- `Product Review API`
- `/review/seller/history/list`
- `/review/seller/list/v2`
- `/review/seller/reply/add` (endpoint ghi, đang khóa an toàn)

### Tính năng có thể làm

- Lấy danh sách review
- Lọc review chưa trả lời
- Trả lời review
- Cảnh báo SKU bị review xấu nhưng vẫn đang đốt ads

### Luồng shop có API

- Shopee có API: đọc review bằng `Product.get_comment`, lưu vào `marketplace_product_reviews`, lọc review xấu/chưa trả lời/media và hiển thị ở Trung tâm API.
- Lazada có API: đọc lịch sử review theo cửa sổ tối đa 7 ngày bằng `/review/seller/history/list`, lấy chi tiết theo cụm tối đa 10 id bằng `/review/seller/list/v2`.
- Phản hồi review thật lên sàn chưa mở; hệ thống chỉ tạo preview/log qua `marketplace_review_action_logs`, `sent_to_platform=false`.

### Luồng shop không có API

- Không gọi Open Platform và không gắn nhãn “đồng bộ API”.
- Fallback là xem dữ liệu đã lưu trong OMS, import/report hoặc thao tác tay trên Seller Center có log; nếu cần phản hồi thì người vận hành copy nội dung từ preview và tự gửi trên sàn.

### Trạng thái hiện tại

- `Đã xong`
  - `review_core` backend đã có bảng `marketplace_product_reviews` và `marketplace_review_action_logs`.
  - API `/api/reviews`, `/api/reviews/product-risk`, `/api/reviews/actions`, `/api/reviews/sync`, `/api/reviews/shopee/sync`, `/api/reviews/lazada/sync`, `/api/reviews/reply-suggest`, `/api/reviews/reply-preview`, `/api/reviews/reply-action`, `/api/reviews/repair-mapping`, `/api/reviews/lazada/batch-sync` đã deploy.
  - Page riêng `reviews.html` đã tách phase 1/2/3: tổng quan review/rủi ro ADS, AI gợi ý phản hồi có guard, hàng đợi duyệt/log thao tác.
  - Shopee production đã sync đọc-only `100` review, trong đó `3` review xấu, `0` review cần trả lời, `14` review có media.
  - Repair mapping review đã nối thêm `marketplace_product_knowledge.variations` theo `model_id`; production đã đưa `catalog_gap_reviews` về `0`, gồm cả item Shopee `14108646386 -> GANGTAYCACHNHIET_K09`.
  - Lazada adapter đọc history/list đã chạy production ở cửa sổ an toàn 28 ngày với `subrequest_budget`; lượt kiểm mẫu hiện quét `7` item, `28` cửa sổ, `0` warning quota và chưa có review trong 28 ngày/item đã chọn.
  - OMS Dashboard / Trung tâm API đã có module và workspace `Đánh giá sản phẩm`, nút `Cập nhật đánh giá API`, `Batch Lazada 28 ngày an toàn`, `Sửa mapping review`, metric tổng review/review xấu/cần trả lời/trùng ADS/thiếu map catalog.
  - Trang sản phẩm và trang ADS đã đọc `/api/reviews/product-risk`; production Chrome mobile `390px` hiển thị `3` sản phẩm có review xấu, `0` sản phẩm trùng ADS đang chi tiền trong 14 ngày.
- `Đang làm dở`
  - Batch Lazada 28 ngày hiện mới quét `7` item/lượt theo ngân sách subrequest an toàn; nếu muốn phủ sâu hơn phải chạy nhiều lượt/cursor hoặc tách job nền.
- `Đã xong phase 1/2/3`
  - Phase 1: màn tổng quan review, review cần xử lý, review xấu trùng ADS và filter theo sàn/shop/từ khóa.
  - Phase 2: tạo gợi ý phản hồi từ review core, có guard chặn kéo khách ra ngoài sàn/số điện thoại/chuyển khoản.
  - Phase 3: lưu nháp vào `marketplace_review_action_logs`, duyệt/copy/đánh dấu gửi tay/hủy và ghi trạng thái `send_locked` khi bấm gửi thật nhưng khóa live chưa mở.
- `Bị khóa an toàn`
  - Shopee `Product.reply_comment` và Lazada `/review/seller/reply/add` vẫn chưa tự gửi thật lên sàn. Nút gửi thật trên page chỉ ghi `send_locked` để tránh phản hồi sai khách khi chưa bật khóa live.

### Checklist phase tiếp theo

- [x] Tạo `review_core`
- [x] Nối Lazada review history/list đọc-only và reply preview khóa an toàn
- [x] Tìm/đối chiếu thêm bộ review tương đương của Shopee: `Product.get_comment` và `Product.reply_comment`
- [x] Gắn review vào Trung tâm API / OMS Dashboard
- [x] Gắn review vào dashboard sản phẩm / ads
- [x] Repair mapping review từ `product_catalog_core` + `listing knowledge` theo `model_id`
- [x] Chạy batch Lazada 28 ngày ở chế độ an toàn theo `subrequest_budget`
- [x] Tách page riêng `reviews.html` cho phase 1/2/3
- [x] Thêm hàng đợi duyệt/copy/đánh dấu gửi tay cho phản hồi review
- [ ] Tách batch Lazada nhiều lượt/cursor nếu muốn phủ sâu hơn 7 item/lượt
- [ ] Mở khóa gửi thật lên sàn sau khi test quyền endpoint và điều kiện an toàn

---

## 9. Webhook / push / notification

### Module endpoint liên quan

**Shopee**
- `Push`
- `Shop.get_shop_notification`

**Lazada**
- Push / callback theo tài liệu LazOP 2.0

### Tính năng có thể làm

- Cập nhật gần realtime:
  - order status
  - reverse order
  - low stock
  - product create/edit/delete
  - video status
  - auth expiry
- Giảm polling
- Giảm nguy cơ throttling

### Trạng thái hiện tại

- `Đã xong`
  - `marketplace_push_core` đã phân nhóm event, coverage và API đọc `/api/webhooks/events?core=1`
  - API đối chiếu subscription/callback: `/api/webhooks/events?core=1&subscriptions=1&probe=1`
  - Shopee đọc được `Push.get_app_push_config` ở production, callback đúng `/api/webhooks/shopee`, live push `Normal`
  - Shopee/Lazada callback verify trả HTTP 200 trên production
  - Hàng đợi sync incremental `marketplace_push_sync_queue` đã deploy; webhook Shopee/Lazada đưa event vào queue theo nhóm `sync_order`, `sync_return_order`, `sync_order_label`, `sync_products`, `record_chat_signal`
  - API vận hành queue `/api/webhooks/sync-queue` đã chạy production: test webhook Shopee chat an toàn tạo queue, bấm/chạy queue trả `done=1`, không ghi cấu hình hoặc gửi lệnh lên sàn
  - OMS Dashboard / Trung tâm API đã có khu `Hàng đợi push incremental`, hiển thị đang chờ/đã xử lý/lỗi cần retry và nút `Chạy hàng đợi push`
- `Đang làm dở`
  - đã có webhook handler nền và queue retry cho nhiều luồng; các event return/product/label sẽ sync theo lát cắt nhỏ để tránh chậm callback
  - Shopee còn 9 event đang bật một phần giữa các partner app; chưa tự gọi lệnh ghi `set_app_push_config`
- `Chưa làm`
  - Lazada Message Service/Push Mechanism chưa được subscribe đủ trong console theo nhóm order/reverse/product/stock/video/auth/review/IM
  - chưa bật đồng nhất Shopee push cho các partner app nếu shop dưới partner đó cũng cần realtime

### Checklist phase tiếp theo

- [x] Tạo `marketplace_push_core`
- [x] Tạo API đối chiếu subscription/callback và probe Shopee push config read-only
- [x] Xác nhận callback Shopee/Lazada production trả 200
- [x] Gắn push vào sync incremental của OMS bằng queue nội bộ và UI Trung tâm API
- [ ] Đăng ký đầy đủ event Shopee push cần dùng
- [ ] Đăng ký đầy đủ Lazada push theo reverse/order/product/video/auth

---

## 10. Logistics, labels, đóng gói, fulfillment

### Module endpoint liên quan

**Shopee**
- `Logistics`
- `FirstMile`

**Lazada**
- `Lazada Logistics API`
- `Logistics API`
- `Fulfillment API`
- `FBL API`
- `Logistics Station API`

### Tính năng có thể làm

- Lấy shipment list, package detail
- In nhãn / AWB PDF/HTML
- Repack package
- Theo dõi SLA giao nhận
- Cảnh báo giao thất bại nhiều lần

### Trạng thái hiện tại

- `Đã xong phần theo dõi trực tiếp trên đơn hàng`
  - OMS đã có panel `Theo dõi vận chuyển` ngay trong trang Đơn hàng, đọc từ `/api/logistics-watch`, tách các nhóm `Thiếu tracking`, `Đã đóng gói`, `Chờ lấy hàng`, `Giao lỗi`, `Hoàn/trả`.
  - Bấm từng nhóm trên panel sẽ lọc thẳng bảng đơn bằng `logistics_watch`, không bắt vận hành mở Trung tâm API.
  - Dòng đơn hiển thị nhãn nhỏ như `Thiếu tracking`, `Đã đóng gói`, `Giao lỗi`, `Hoàn/trả` để nhìn vấn đề logistics ngay khi xử lý đơn.
  - Shop có API và shop không API được tách rõ: shop API ưu tiên đọc tracking/trace/AWB; shop không API chỉ là tham chiếu để quét trình duyệt, import file hoặc xử lý tay.
- `Đã xong phần video/tem phục vụ khiếu nại hoàn/trả`
  - OMS đã có nút `Quét QR code` trong panel `Theo dõi vận chuyển`: mở camera mobile, đọc QR/barcode mã đơn hoàn hoặc mã vận đơn rồi gọi `/api/returns/receive-scan` để xác nhận hàng đã hoàn về shop.
  - Shop có API dùng dữ liệu hoàn/trả đã đồng bộ từ sàn, shop không API dùng dữ liệu D1/import/browser; thao tác camera chỉ ghi nhận kho nội bộ, không gửi lệnh lên sàn.
  - `/api/cctv/scan-order` kiểm được mã đơn/mã vận đơn, tem đã tải về trong R2 và video đóng gói gần nhất.
  - `/api/cctv/scan-order` trả thêm `item_summary.total_qty`, `sku_count` và `speech_text`; trạm quay phát giọng đọc tiếng Việt khi quét mã để nhân viên biết đơn có bao nhiêu sản phẩm.
  - Trạm `cctv_packing.html` nếu quét mã vận đơn sẽ map về mã đơn thật trước khi lưu video, tránh lưu video bằng tracking number.
  - Trạm `cctv_packing.html` ưu tiên đọc nhanh QR + barcode vận đơn `CODE_128`, có chống quét trùng trong 1,2 giây và rút mã sạch từ QR dạng URL/query/JSON.
  - Trạm `cctv_packing.html` đã có luồng quay liên tục: quét mã đầu phát `Sẵn sàng`, quét mã vận đơn khác sẽ chốt video đơn cũ, phát `Đã lưu, tiếp tục đơn mới` và tự bắt đầu quay đơn mới.
  - Video đóng gói tải lên đã được ghi overlay trực tiếp trong file: `Ngày giờ quay` đủ ngày/tháng/năm giờ/phút/giây, `Mã vận đơn` đầy đủ và mã đơn nếu map được.
  - Trạm `cctv_packing.html` có khu `Cài đặt nhanh` hiển thị QR `STOP_PACKING`, nút tải QR và chế độ `Tối màn hình` để tiết kiệm pin nhưng vẫn giữ camera chạy khi trang còn mở.
  - UI ghi rõ giới hạn trình duyệt mobile: khóa/tắt hẳn màn hình điện thoại sẽ dừng camera, nên luồng web dùng màn hình tối + Screen Wake Lock thay vì hứa quét nền.
  - `/api/cctv/scan-order` chuẩn hóa payload QR/barcode thành `scan_code` và `scan_candidates`, giữ backend là lớp bảo vệ nếu frontend nhận chuỗi QR thô.
  - Kho video đóng gói hiển thị link tải video để dùng làm chứng cứ khiếu nại nếu đơn bị trả hàng/hoàn tiền.
  - OMS có `Kho tem in` để xem tem đã lưu, tem lỗi, tải lại, in lại và cấu hình mẫu/watermark theo từng sàn.
  - `/api/labels/status` trả summary + filter `status/platform/q` từ `order_labels`; UI không đọc R2 từng file khi mở kho để tránh vượt giới hạn Worker.
  - Mẫu tem có preview realtime, logo shop, watermark theo sàn, ký hiệu `REC` và lời nhắc khách quay video khi khui hàng; lớp này chỉ in chồng lên tem, không sửa mã vạch/QR gốc của sàn.
  - Giao diện `Mẫu & watermark` đã chỉnh lại theo hướng ShipXanh: tab sàn ngang, bảng lớp cấu hình, panel chỉnh từng lớp và preview mã vận đơn lớn để dễ thao tác.
  - Giao diện `Tùy chỉnh phiếu giao hàng` đã tham chiếu thêm nhiều mẫu ShipXanh: bánh xe mở setting từng lớp, nút `Lớp` giữ vai trò lớp/nhân bản, bảng mẫu có thời gian tạo và preview dạng phiếu thực tế với logo sàn, barcode, QR, tracking lớn, tiền thu hộ, lời nhắc quay video và footer hotline.
  - Hồ sơ khiếu nại lưu video, tem, mã return/reverse và trạng thái sàn đang xử lý để OMS không mất dấu sau khi gửi.
- `Đang làm dở / khóa an toàn`
  - Shopee đã có nền tracking, package detail, tem và dry-run `ship_order/mass_ship_order`; batch tem/job, lịch lấy hàng và FirstMile tracking/waybill là nhóm nên làm tiếp.
  - Lazada mới nên mở trước trace + AWB/document read-only; EPIS consign/RTS/cancel và Fulfillment/FBL phải có guard riêng trước khi gửi lệnh thật.

### Checklist phase tiếp theo

- [x] Thêm theo dõi logistics trực tiếp trên trang Đơn hàng OMS
- [x] Thêm API đọc-only `/api/logistics-watch`
- [x] Thêm bộ lọc `logistics_watch` cho `/api/orders`
- [x] Thêm quét mã hoàn về kho và xác nhận đã nhận hoàn nội bộ
- [x] Thêm quét camera QR/barcode trên OMS để mã đơn hoàn/mã vận đơn tự xác nhận đơn đã hoàn về shop
- [x] Thêm kiểm tra tem tải về + video đóng gói theo mã đơn/mã vận đơn
- [x] Thêm `Kho tem in` có tab tem đã lưu, tem lỗi, tải lại/in lại và mẫu watermark preview realtime
- [x] Sửa công tắc, thêm mẫu và bấm hàng mẫu trong tab tuỳ chỉnh phiếu giao hàng
- [x] Thêm hồ sơ khiếu nại hoàn/trả và tab `Đang Khiếu Nại`
- [x] Nối Shopee `returns.upload_proof` để gửi video chứng cứ khi người vận hành xác nhận
- [ ] Chuẩn hóa `shipment_core`
- [ ] Nối Shopee logistics SLA, batch tem/job và FirstMile
- [ ] Nối Lazada trace + AWB/document read-only thành luồng vận hành riêng
- [ ] Nối Lazada EPIS/Fulfillment/FBL có preview, guard, quyền admin và log trước khi thao tác thật
- [ ] Đồng bộ trạng thái label/fulfillment vào OMS
- [ ] Nối Lazada reverse/return media upload và phản hồi khiếu nại nếu endpoint/quyền app đủ

---

## 11. Tài khoản shop, hiệu suất shop, sức khỏe tài khoản

### Module endpoint liên quan

**Shopee**
- `AccountHealth`
- `Shop`

**Lazada**
- `Seller API`

### Tính năng có thể làm

- Shop performance
- Penalty / late orders / listing issues
- Seller metrics cập nhật mới nhất
- Kiểm tra shop còn active hay không
- Cảnh báo KPI vận hành xấu trước khi đẩy ads/promo mạnh
- Shopee Shop API theo hình đã rà: `get_shop_info`, `get_profile`, `update_profile`, `get_warehouse_detail`, `get_shop_notification`, `get_authorised_reseller_brand`, `get_br_shop_onboarding_info`, `get_shop_holiday_mode`, `set_shop_holiday_mode`

### Trạng thái hiện tại

- `Đã xong phần đọc / đang khóa phần ghi`
  - Đã nối nhóm endpoint Shopee Shop trong checklist và Advanced API center.
  - Các endpoint đọc như `get_shop_info`, `get_profile`, `get_warehouse_detail`, `get_shop_notification`, `get_authorised_reseller_brand`, `get_br_shop_onboarding_info`, `get_shop_holiday_mode` đã có snapshot read-only trong Trung tâm API.
  - Các endpoint ghi `update_profile` và `set_shop_holiday_mode` phải có preview payload, quyền admin, log và xác nhận riêng vì thay đổi hồ sơ/trạng thái shop thật.

### Checklist phase tiếp theo

- [ ] Tạo `shop_health_core`
- [x] Nối read-only Shopee Shop profile/warehouse/notification/brand/holiday mode vào core shop chung
- [ ] Thiết kế guard cho `update_profile` và `set_shop_holiday_mode`, chưa bật apply thật khi chưa có màn xác nhận
- [ ] Dashboard penalty / listing issues / late orders
- [ ] Nối seller metrics Lazada
- [ ] Nối account health Shopee

---

## 12. Livestream, content AI, membership, mở rộng sau

### Module endpoint liên quan

**Shopee**
- `Livestream`
- `Public`
- `Merchant`

**Lazada**
- `LazLive API`
- `Content API`
- `Membership API`
- `LazLike API`

### Tính năng có thể làm

- Livestream metrics
- Content enhancement
- Membership / loyalty
- Nội dung AI hỗ trợ seller
- Theo dõi tương tác khách hàng mở rộng

### Trạng thái hiện tại

- `Chưa làm`

### Checklist phase tiếp theo

- [ ] Chỉ bắt đầu sau khi xong order/product/ads/chat/video/payment

---

## Thứ tự ưu tiên hoàn thiện tổng thể

### Ưu tiên 1: dữ liệu sống còn

- [x] `return_reverse_core` (backend/API/UI đã kiểm production)
- [x] `order_finance_core`
- [ ] `marketplace_push_core` (core/subscription probe + queue incremental OMS đã deploy; còn Shopee partial partner app và Lazada Message Service)
- [x] `inventory_stock_core` bản Lazada nâng cao (core/route/FBL probe đã deploy; production đã xác nhận shop hiện chỉ có `seller_quantity`, chưa có warehouse/channel/FBL binding)

### Ưu tiên 2: vận hành bán hàng

- [x] `promotion_tool_core` (core/route + Shopee Discount/Voucher/Bundle/Add-On/Flash + Lazada Seller Voucher/Free Shipping/Flexicombo read-only + batch/cron lát cắt + UI page con/drilldown/preview khóa đã deploy và kiểm production; còn Early Bird apply thật và luồng duyệt/rollback)
- [x] `review_core` (core/route + Shopee get_comment read-only + Lazada history/list adapter + repair mapping theo catalog/knowledge + UI Trung tâm API + dashboard sản phẩm/ADS + reply preview khóa đã deploy và kiểm production; catalog gap đã về `0`, còn hàng đợi duyệt reply thật và batch nhiều lượt nếu cần phủ Lazada sâu hơn)
- [x] `video_library_core` Lazada (Media Center upload/detail/quota/remove + kho D1/R2; chưa có analytics/list chính thức)
- [ ] `ads` apply thật có guard theo role

### Ưu tiên 3: tối ưu tăng trưởng

- [ ] shop health / seller metrics
- [ ] livestream / content / membership

### Ghi chú phase chat TikTok mới nhất

- TikTok browser fallback đã chuyển sang `thread-first`: preview chỉ để phát hiện hội thoại thay đổi, thread là nguồn tin nhắn thật.
- Worker dedupe TikTok đã bỏ `sent_at` khỏi fingerprint để cleanup được cả dữ liệu lặp giữa nhiều lượt quét cũ và mới.
- Production đã cleanup TikTok shop `0909128999` theo 2 lượt (`163` row + `153` row trùng); hội thoại `t_thzy2` còn `5` dòng thật, preview còn 1 câu cuối, không còn lặp chuỗi `18:14 / 18:15 / 18:19 / ...`.

---

## Nguyên tắc cập nhật file này

Sau mỗi phase phải cập nhật:

1. Dòng trạng thái của nhóm vừa làm.
2. Checklist đã tick được gì.
3. Phần nào bị khóa an toàn.
4. Phần nào bị chặn bởi quyền/app.
5. Cách shop không API đang fallback.

## Ghi chú 2026-05-14 - Refactor source và mở luồng vận hành ADS/Discount

- [x] Route Worker đã gom theo feature folder (`routes/admin`, `routes/api`, `routes/ads`, `routes/orders`, `routes/products`, `routes/discounts`, `routes/marketplace-chat`...), public URL không đổi.
- [x] Core Worker đã gom theo domain (`core/orders`, `core/products`, `core/ads`, `core/promotions`, `core/shops`, `core/chat`...), import nội bộ đã cập nhật.
- [x] Frontend JS/CSS root đã gom theo feature, HTML đã trỏ sang đường dẫn mới.
- [x] Product create/update dùng dữ liệu thật người dùng nhập, không dùng tên/SKU mặc định; hỗ trợ variant nhiều SKU.
- [x] Đơn chuyển `Đã đóng gói` tự kiểm và retry tem: shop API gọi refresh label, shop không API tạo job local/helper có log.
- [x] TopPicks đọc/phân tích cache không còn crash do thiếu dependency; dữ liệu trống trả empty state.
- [x] ADS Guard tách Shopee/Lazada và lấy campaign/adgroup từ ADS snapshot theo shop; vẫn có manual advanced khi cần đối soát.
- [x] Discount có bộ lọc shop/tồn/doanh thu/hiệu quả/trạng thái và nhãn tiếng Việt chuẩn.
- [x] Shopee Voucher/Bundle/Add-On/Flash Sale hiển thị là luồng có preview/apply guard khi backend hỗ trợ; Lazada promotion write live giữ read-only nếu chưa có adapter chính thức.
- Shop có API: chạy qua Open Platform/cache D1, có guard preview/apply và log.
- Shop không API: không gắn nhãn API; dùng import/browser/helper hiện có cho label/cache khi có đường fallback, còn thao tác sàn không hỗ trợ thì hiện lý do rõ.

## Ghi chú 2026-05-15 - Shopee promotion/ADS/TopPicks verify-first

- [x] Shopee Discount, Voucher, Bundle, Add-On, Flash Sale, ADS Manual Product Ads và TopPicks đã chuyển sang kết quả action thống nhất: có endpoint, action, shop, object_id, request_id, payload đã che secret, raw error/response và `verify_result`.
- [x] Mọi mutation Shopee trong các route đã sửa chỉ được coi là thành công khi refetch từ Shopee xác nhận `verified=true`; cache D1 chỉ cập nhật sau dữ liệu refetch, không dùng cache để giả lập thành công.
- [x] Flash Sale create bị khóa nếu thiếu `timeslot_id` thật từ `/api/v2/shop_flash_sale/get_time_slot_id`; UI ghi rõ start/end chỉ để đối chiếu, không thay thế timeslot.
- [x] ADS campaign status/budget/ROAS target đi qua `/api/v2/ads/edit_manual_product_ads`, sau đó refetch `/api/v2/ads/get_product_level_campaign_setting_info` để verify.
- [x] TopPicks UI ghi rõ API Shopee không trả attribution đơn hàng trực tiếp; số mua kèm nếu có phải đến từ tracking/order nội bộ, không tự kết luận từ API.
- [x] Tab `Cập nhật cache` và feature card không còn nhãn "Ghi thật: đã mở" nếu chưa có verify live; card tách read/cache với action ghi thật.
- [ ] Live mutation an toàn chưa chạy trong phase này vì chưa có `SHOPEE_AUDIT_SHOP` và allowlist object đã được phép thao tác. Chưa được ghi là "đã kết nối Shopee thật" nếu thiếu live response + request_id + refetch verify.

### Trạng thái shop

- Shop có API: khi có token/quyền hợp lệ, route sẽ gọi Open Platform thật, tự refresh token ở luồng đã có helper, refetch verify và trả lỗi chi tiết nếu Shopee từ chối.
- Shop thiếu quyền/token: UI/API phải hiển thị thiếu quyền hoặc lỗi endpoint cụ thể, không hiện nút gây hiểu nhầm là đã ghi thật.
- Shop không API: chỉ được đọc cache/import/browser helper có log; không gắn nhãn đồng bộ API và không dùng cache để báo Shopee đã thay đổi.


### Ghi ch? phase chat UI ??n h?ng v? n?t nh?n kh?ch

- OMS ?? s?a nh?n n?t `Nh?n kh?ch` v? ti?ng Vi?t c? d?u, b? chu?i l?i font/m? h?a ? c?t `Shop / KH`.
- Tab `??n h?ng` trong chat ?? b? c?c note v?ng d?i v? b? toolbar sync trong panel ph?i; panel ch? c?n card ??n v? n?t `Ch?n tr?ng th?i ??n`.
- N?t `??ng b? ??n h?ng` ?? chuy?n l?n header h?i tho?i cho shop c? API ??n h?ng; shop kh?ng API kh?ng hi?n n?t n?y.
- Header chat ???c ?p rerender l?i ngay sau khi context ??n h?ng t?i xong, k? c? thread seed ho?c thread ?t tin, ?? tr?ng th?i sync kh?ng b? tr? hi?n th?.
## Ghi chú 2026-05-10 - Chat Shopee API shop `chihuy2309`

- [x] Xác nhận production `chihuy2309` là Shopee shop có API chat: `transport=api`, `scan_mode=api_direct`, token còn sống.
- [x] Sửa seed hội thoại từ OMS để shop Shopee có API không bị ép `transport=browser`.
- [x] Sửa frontend để hội thoại Shopee thuộc shop API không fallback helper local `/chat-send` đại trà khi bấm `Gửi`.
- [x] Cập nhật 2026-05-10: mở ngoại lệ có kiểm soát cho hội thoại `oms_order_seed` Shopee thiếu `buyer_id`; luồng vẫn thử API trước, chỉ fallback helper local sau lỗi `missing_buyer_id`.
- [x] Sửa helper local Shopee Webchat để cửa sổ automation thấp vẫn tìm được ô nhập; dry-run `phuongto.rt / chihuy2309` đã chọn đúng khách, bấm gửi và chặn request thật với `send_request_captured=true`.
- [x] Sửa chuẩn API cho nút `Nhắn khách` từ đơn Shopee API: lấy `buyer_user_id` từ `/api/v2/order/get_order_detail`, lưu `orders_v2.buyer_id`, cập nhật hội thoại seed và dry-run `send_message` đã sinh `to_id=243511413` cho đơn `260508T7H2B2A8`.
- [x] Sửa lỗi Shopee `first_chat_without_order_info` khi gửi tin đầu tiên từ đơn: nếu text thường bị chặn, Worker tự gửi lại qua SellerChat `send_message` với `source_type=order` và `source_content.order_sn`; production đã gửi thật nội dung `ok` cho `phuongto.rt / chihuy2309`, Shopee trả `message_id=2412547899391328626`.
- [x] Backend thử kéo metadata từ `/api/v2/sellerchat/get_conversation_list` trước khi báo thiếu `buyer_id`.
- [x] Dry-run production ban đầu cho `phuongto.rt / automation-shopee-seed-nhe6qz` xác nhận lỗi gốc là thiếu `buyer_id`; cập nhật mới đã lấy `buyer_user_id` từ Order API nên seed này dry-run ra payload `send_message` OK.
- [x] Dry-run production với thread Shopee API có `buyer_id` sinh payload `send_message` đúng, xác nhận luồng API không bị hỏng.
- [x] Kiểm trực tiếp Open Platform bằng profile `ShopeeOpenPlatform` và cập nhật local reference + JSON tra nhanh: ghi 18 endpoint `v2.sellerchat.*`, trạng thái `error_auth`, `webchat_push`, `delete_message` và nhóm media/read/unread/pin/mute.
- [x] Đối chiếu các tên endpoint mở thread từ đơn như `open_conversation`, `open_session`, `get_conversation_by_order_sn`, `get_order_conversation`, `start_conversation`: Open Platform trả `error_not_exists`.
- [x] Thêm route production `POST /api/chat/shopee-permission-probe` để test quyền SellerChat bằng token shop thật; endpoint ghi chỉ probe bằng payload trống/sai tham số, không gửi tin thật.
- [x] Thêm nút `Test quyền Shopee Chat` trong tab `AI & Luật` để sau này kiểm lại quyền API ngay trên web.
- [x] Production probe `chihuy2309` xác nhận SellerChat core có quyền thật: `ok=5`, `reachable_param_error=11`, `permission_blocked=4`; `send_message` tới được nhưng cần `buyer_id/to_id`, offer endpoint trả `api_suspended`.
- [x] Rà Open Platform live cho media chat: thấy `v2.sellerchat.upload_image` + `send_message` cho ảnh, `webchat_push` có ví dụ emoji/image/video inbound; rà thêm announcement `content_id=1052` xác nhận luồng video chat `v2.sellerchat.upload_video` -> `v2.sellerchat.get_video_upload_result` -> `v2.sellerchat.send_message`.
- [x] Production probe `chihuy2309` cho video chat: `upload_video` và `get_video_upload_result` đều `reachable_param_error`, tức endpoint tới được nhưng cần schema đúng; dry-run `/api/chat/send` đã trả payload `send_message` `message_type=video`.
- [x] Sửa core đọc media Shopee: text emoji giữ nguyên, `message_type=image/video/sticker/emoji` không còn bị nhầm sang product/file; đã dọn 24 dòng image cũ trong D1 và kiểm production render ảnh OK.
- [x] Mở luồng gửi ảnh/video Shopee trong backend/UI: ưu tiên upload chính thức, nếu upload còn `param_error` thì thử gửi bằng URL media OMS qua `send_message`; dry-run production đã sinh payload `message_type=image` và `message_type=video` với URL tuyệt đối.
- [x] Sửa UI chat để thấy rõ chức năng media đã mở: nút `Ảnh/video API`, dòng trạng thái `Ảnh/video API` trong khung soạn, mobile có `Album API`/`Chụp API`; production mobile `390x844` đã chọn file test và preview hiện không tràn ngang.
- [ ] Schema upload chính thức vẫn chưa chốt: sample probe `upload_image` đã tới endpoint nhưng mọi biến thể request hiện trả `param_error`; `upload_video`/`get_video_upload_result` cũng mới xác nhận endpoint tới được, còn thiếu schema chi tiết vì `doc/api` vẫn trả `error_auth`.
- [ ] Endpoint Shopee chính thức mở thread từ `order_sn` vẫn chưa thấy trong public docs; text từ đơn đã gửi được bằng `send_message` kèm order context, còn endpoint mở thread riêng chỉ cần nếu sau này muốn tạo/lấy thread trước khi gửi.

- 2026-05-18: OMS/Dashboard fee phase 1 đã chuẩn hóa `Sàn hỗ trợ khách` / `Voucher từ sàn/Shopee` là cùng một dữ liệu API từ `order_fee_details.raw_data` và cộng vào tổng phí trừ. Popup phí đơn hàng chuyển sang tab `Khách thanh toán`, `Sàn thanh toán`, `Lợi nhuận`, `Nguồn API`; shop có API dùng raw fee detail trước, shop không API vẫn fallback cost setting/import và phải hiện rõ nguồn.
- 2026-05-19 TikTok Seller Center finance: đã thêm guard không nâng estimate cũ thành `actual_income`, không hạ actual confirmed về `NULL`, batch eligibility tối đa 20. Production order `584098737148888997` vẫn pending vì chưa có `Số tiền bạn kiếm được`; Finance guard sau rebuild `sync_payment=false` pass và duplicate orders/items = 0.
## OMS/Core Hotfix 2026-05-20

- Shopee official read endpoints used for OMS tracking/status/detail:
  - `/api/v2/order/get_order_detail`
  - `/api/v2/logistics/get_tracking_number`
  - `/api/v2/logistics/get_tracking_info`
  - Label download flow remains guarded to shipping document parameter/create/result/download only; no `ship_order`, `mass_ship_order`, `arrange`, `confirm`, or `cancel`.
- Lazada official endpoints used or documented for OMS/Core:
  - Order detail/items: `/orders/get`, `/order/items/get`
  - AWB/document: `/order/package/document/get`
  - Tracking timeline: `/logistic/order/trace`
  - Finance/settlement: `/finance/transaction/details/get`, `/finance/transaction/accountTransactions/query`, `/finance/payout/status/get`
- Source routing is fixed:
  - Shopee API: `chihuy1984`, `chihuy2309`, `phambich2312`
  - Lazada API: `kinhdoanhonlinegiasoc@gmail.com`
  - Shopee Seller Center fallback: `khogiadungcona`
  - TikTok Seller Center/local helper fallback: `0909128999`
- OMS panel `Đồng bộ & tải lại` must dry-run by date/shop/platform before real small batch. Label retry uses `POST /api/label/retry-failed`; order backfill uses `POST /api/orders/manual-sync/backfill`.
- Lazada API finance missing permission/data must show `api_permission_missing` or `Thiếu dữ liệu Finance API`; cost setting must not be labeled confirmed API fee.
- Home links: `Quét mã` is QR packed/cancel/return; `Ghi hình` is CCTV/video packing.

## OMS/Core follow-up 2026-05-20

- [x] Endpoint-first guard added to `AGENTS.md`, repo/local Skill, `PROJECT-CURRENT-STATE.md`, and test `scripts/test-endpoint-first-guard.mjs`.
- [x] TikTok pending settlement guard: no settlement => `actual_income=null`, `actual_income_confidence=none`, `estimated_income_source=tiktok_estimated_fee`, OMS label `Thực nhận tạm tính` / `Lãi tạm tính`.
- [x] Shopee tracking endpoint remains `/api/v2/logistics/get_tracking_info`; Lazada tracking endpoint remains `/logistic/order/trace`; cached Tracking Core events stay visible when API call is blocked.
- [x] Lazada chat bridge added for Chat Worker through `/im/session/list`, `/im/message/list`, `/im/message/send`; missing IM permission/token is explicit.
- [x] Lazada Finance source normalized to `/finance/transaction/details/get` and `lazada.finance.transaction.details.get`.
- [x] D1/fetch guard still covered by `/api/orders limit=200` chunking tests and frontend last-good-data banner tests.
- [x] Production 2026-05-20: `/api/orders?limit=200` pass, Shopee tracking order `260520UWGXD1S9` has API timeline, Lazada tracking order `525472804102182` returns empty reason from `/logistic/order/trace`, TikTok order `584104642942568017` stays manual/local helper.
- [x] Production 2026-05-20: Shopee `Nhắn khách` from order sent safe `ok`; Lazada opened Chat Worker but send failed safely with `missing_session_id`; TikTok did not fake send.
- [x] Production 2026-05-20: OMS static Worker `af727200-7f3c-4c94-8118-58b5819e9144` pass responsive on loaded production tab desktop/tablet/mobile.

## Runner browser lifecycle 2026-05-20

- [x] Shopee no-API và TikTok Seller Center fallback không được ghi `running/completed` nếu chưa có `browser_launch_requested`.
- [x] Job runner ghi lifecycle rõ trong `log_text.lifecycle_events`: `runner_picked`, `browser_launch_requested`, `browser_launched`, `login_checking`, `runner_started`, `runner_finished`.
- [x] TikTok `0909128999` dùng profile automation `E:\shophuyvan-python-automation\profiles\browser\shophuyvan-runner-tiktok`, headful, Chrome PID `11996`, CDP `9331`, final job `1110` completed.
- [x] Shopee no-API `khogiadungcona` dùng profile automation `E:\shophuyvan-python-automation\profiles\browser\HuyVan_Bot_Data_khogiadungcona`, headful, Chrome PID `4132`, CDP `9332`, final job `1111` completed.
- [x] `one_shot_batch_completed` chỉ lưu history/status, không còn là pause chặn lần chạy mới.
- [x] Safety: không dùng profile user cho automation, không `taskkill chrome.exe`, không đóng Chrome user.

## Cập nhật 2026-05-21 - Automation và endpoint first

- Shopee API shops `chihuy1984`, `chihuy2309`, `phambich2312`: order/status/tracking/label/finance phải kiểm và dùng Shopee Open Platform/Worker API trước; không Seller Center Chrome fallback.
- Lazada API `kinhdoanhonlinegiasoc@gmail.com`: dùng Lazada Open Platform/Worker API; không Chrome fallback.
- Shopee no-API `khogiadungcona` và TikTok `0909128999`: mới được dùng local Python/Chrome automation bằng profile map chuẩn.
- Label endpoint: API shop dùng document download route đã guard `allowFulfillmentAction=false`; no-API/TikTok dùng `retry_label` runner, không ship/arrange/confirm/cancel.

## Cập nhật 2026-05-21 - E2E endpoint/readback checklist

- [x] TikTok Finance Transactions: Seller Center fallback đúng profile, đã bấm `Xem chi tiết`, parse settlement panel, Finance Core readback `estimated_income=67.755`, `actual_income=null`.
- [x] TikTok Logistics: Seller Center detail đúng profile, đã bấm `Thông tin kho vận`, Tracking Core có events cho order `584128214410102531`.
- [x] TikTok Label: `retry_label` local Chrome read-only tải PDF sample `584123080227784403`, Label Core `downloaded`, không ship/arrange/confirm/cancel.
- [x] TikTok Chat: mở Seller Center chat từ order đúng khách/order ở mức manual-ready, không gửi tin live.
- [x] Shopee no-API Finance: Seller Center detail đúng profile, sample `260520VPM23704` có settlement `70.030` và voucher taxonomy đúng.
- [x] Shopee no-API Tracking/Chat: đã bấm `Mở rộng` và `Chat ngay`; Tracking Core source `shopee_seller_center_tracking_expanded`, chat mini panel mở đúng khách/order, không gửi tin.
- [x] Lazada API Order/Status/Trace: route Worker/Open Platform chạy lại cho shop `kinhdoanhonlinegiasoc@gmail.com`, không Chrome.
- [x] Lazada Label: document route read-only trả `not_ready/pending_retry` an toàn; không fulfillment write.
- [ ] Lazada Finance actual: chưa có settlement confirmed trong readback, tiếp tục ghi `missing:lazada_finance_api` / `Lãi tạm tính`, không dùng cost setting làm actual.

## Cập nhật 2026-05-21 - OMS blocker hotfix checklist

- [x] Lazada `chat-target` không còn 500 khi thiếu conversation row; trả `not_connected/manual_required/lazada_conversation_not_found`.
- [x] Shopee API bucket dùng Label Core + Tracking Core làm điều kiện `Đã Xử Lý`; đơn chưa có tem/tracking vẫn ở `Chờ Xử Lý / Chưa Xử Lý`.
- [x] TikTok Seller Center finance override cost setting fallback; `584123080227784403` không còn badge/warning/row cost setting và `estimated_income=67.755`, `actual_income=null`.
- [x] TikTok legacy `1.620đ` không còn là `actual_income`; map về `sfr_service_fee/tiktok_sfr_fee` và giữ `pending_settlement`.
- [x] UI phân biệt observed zero/missing: buyer shipping observed 0 hiển thị `0đ`, missing hiển thị `Chưa có dữ liệu`; `original_product_amount` không copy mù từ `product_after_discount`.
- [x] Row có cost hợp lệ không hiện `Cập nhật Vốn`; combo map persistence/readback được test bằng Core route.
- [x] Retry label route giữ `retry_label -> taitem.py`; dry-run production không có eligible safe sample nên không chạy live.
- [x] Production browser verification pass desktop/tablet/mobile bằng profile `E:\codex-chrome-profiles\shophuyvan-test`; không gọi send/ship/arrange/confirm/cancel/Payment live.

## Cập nhật 2026-05-21 - OMS Core-first regression lock

- [x] Shopee Label Core API endpoint đã kiểm theo Open Platform Logistics: `/api/v2/logistics/get_shipping_document_parameter`, `/api/v2/logistics/create_shipping_document`, `/api/v2/logistics/get_shipping_document_result`, `/api/v2/logistics/download_shipping_document`.
- [x] Required keys chứng từ in: `order_sn`; `package_number` khi đơn có package/split order; `tracking_number` khi kênh vận chuyển yêu cầu đã có mã vận đơn; `shipping_document_type`; auth/query `shop_id`, `partner_id`, `timestamp`, `access_token`, `sign`; response/result dùng `request_id` và `status=READY|PROCESSING|FAILED`.
- [x] Shopee API OMS bucket dùng Core read-model: tracking thật + label thiếu vào `waiting_label` / `Chờ Tem In`; tracking thiếu mới vào `unprocessed` / `Chưa Xử Lý`; count/list cùng filter `WAITING_LABEL` và tracking-missing.
- [x] Finance Core readback production đã khóa `2605211PH999WY`, `260520VPM23704`, TikTok `584123080227784403`; cost setting không override API/Seller Center, observed zero giữ `0`, missing giữ `null`.
- [x] Regression lock `node scripts/check-oms-core-regression-lock.mjs` pass 11 case Core/OMS/Finance/Label/Chat/Automation. Production deploy cuối: Worker `a89f228f-a767-4bd3-87c5-bdbe38dcdd2b`, static `b756f2fa-3ba4-41f0-8041-4a182d5e1907`.

## Cập nhật 2026-05-22 - OMS date scan Core-first

- [x] Manual date scan route `/api/orders/manual-sync/backfill` hỗ trợ `retry_label`, `sync_finance`, `refresh_tracking`, `sync_detail`, `scan_all_errors`.
- [x] `date_field` khóa trong `created_at`, `updated_at`, `status_updated_at`, `last_synced_at`; live chạy selected order ids từ dry-run.
- [x] Label/Finance/Tracking queues trả đủ field Core bắt buộc và không dựa frontend filter.
- [x] TikTok Seller Center detail order `584117718394898329` readback pending settlement đúng: estimated `63.380`, actual `null`, SFR `1.620`, no cost setting.
- [x] Regression lock mở rộng pass các case TikTok breakdown, label retry queue, finance resync queue, terminal finance, tracking resync queue, manual date scan, dry-run contract, live selected list, UI payload-only.
- [ ] Production UI bằng profile `E:\codex-chrome-profiles\shophuyvan-test` cần đăng nhập lại để kiểm modal date scan sau deploy.

## Cập nhật 2026-05-22 - OMS vận hành manual/Core và TikTok finance/tracking

- [x] Production UI bằng profile `E:\codex-chrome-profiles\shophuyvan-test` đã mở lại được sau deploy; không còn blocker login trong lượt kiểm này.
- [x] Manual run shop field chuyển thành Core shop select: `#botDateScanShop=SELECT`, option TikTok `0909128999` hiển thị theo Core shop/read-model, không nhập tay tên shop.
- [x] `pull_orders`/`Kéo đơn mới` không còn trong dropdown tác vụ thủ công; nút riêng `#btnPullAllCoreShops` nằm ngoài modal để kéo đơn toàn bộ shop khi cần.
- [x] Responsive production pass desktop `1366x900`, tablet `820x1180`, mobile `390x844`; OMS và modal `Cài đặt vận hành` không tràn ngang.
- [x] Nút `Kéo đơn toàn bộ shop` đã bấm production và có trạng thái cuối: TikTok job `1383` completed, Shopee no-API job `1384` completed, job phát sinh `1385` completed.
- [x] Radar/local helper có bằng chứng chạy thật: `refresh_status` jobs `1369/1372`, `retry_label` jobs `1378/1379`, `pull_orders` jobs `1380/1382/1383/1384`, `sync_finance` job `1389`, không chỉ mở Chrome rồi tắt.
- [x] Job rỗng `1388/1392` được chuyển `completed_no_change` vì thiếu `selected_order_ids/order_ids`; rule mới là không mở Chrome automation cho job rỗng sau Core preview.
- [x] TikTok Tracking Core order `584118922740139598` lấy đúng `tiktok_seller_center_logistics_drawer`, tracking `TTVN1080793108`, 7 event logistics, không parse nhầm timeline nội bộ.
- [x] TikTok Finance Core order `584118922740139598` khớp Seller Center: COD, `75.000/90.000/-15.000/0/0/75.000`, phí `-9.750/-4.500/-3.000/-750/-375`, total fee `-18.375`, estimated income `56.625`, profit `30.625`.
- [ ] Queue production còn một số job queued có selected/order ids thật từ lượt trước; đây không phải lỗi job rỗng, cần lượt riêng nếu muốn dọn sạch toàn queue.

## Cập nhật 2026-05-22 - Shopee affiliate, label PDF và automation log

- [x] Shopee Payment endpoint `/api/v2/payment/get_escrow_detail` đã kiểm Open Platform và map `order_ams_commission_fee` vào Finance Core `affiliate_fee`.
- [x] OMS `Sàn thanh toán` hiển thị `Phí hoa hồng Tiếp thị liên kết` từ API, verified production order `260517M6SFEXD5` với giá trị `-11.286đ`.
- [x] Shopee/API label Core reject HTML label cũ; label hợp lệ phải là PDF. Verified refresh PDF cho `2605211C2HMCTT` và `2605211B36B1W5`.
- [x] TikTok parser/status Core không bỏ qua order trong layout mới; live `refresh_tracking` job `1435` completed và chuyển `584123080227784403` sang `Đang giao` khi Tracking Core có event ĐVVC thật.
- [x] `Kéo đơn toàn bộ shop` production không còn chạy mù: modal hiển thị API counts và job rows; jobs `1468/1469` terminal `completed` với số quét/tạo/cập nhật/lỗi.
- [x] Regression/test cuối pass: `node scripts/check-oms-core-regression-lock.mjs`, `node --check`, `python -m py_compile`, `git diff --check`.

## Cập nhật 2026-05-22 - Business log và Chat bridge

- [x] Automation jobs phải ghi business summary và per-order result trước khi coi là pass: scanned/created/updated/unchanged/skipped/failed, changed fields, skip/error, Core readback.
- [x] TikTok no-API `pull_orders` đã verified live bằng Chrome headful với jobs `1579` và `1599`; parser table layout không bỏ đơn thiếu ngày giờ và có log cảnh báo rõ.
- [x] TikTok `retry_label` no-PDF-ready đã phân loại đúng `completed_no_change`/`skipped`; verify job `1641` có per-order `skip_reason=label_pdf_not_ready`.
- [x] Shopee API Chat/CSKH bridge đã verified production bằng message `dạ`, readback `sent` với `platform_message_id`.
- [x] UI final verified bằng Chrome profile ShopHuyVan: Chat/CSKH và OMS modal không tràn ngang trên mobile/tablet/desktop; composer Chat có nút `Gửi` enabled.
- [x] TikTok no-API chat giữ đúng boundary: không fake API send, đi `browser_helper_queue`/manual helper từ Core chat-target.
- [ ] Queue cũ có selected/order ids thật cần replay/dọn riêng nếu muốn kiểm sạch toàn bộ backlog.

## Cập nhật 2026-05-23 - Label/Tracking/Product readback

- [x] Shopee API label retry: cron phải gọi `/api/label/retry-failed` để xử lý lại `pending_document_generation`, `shopee_pdf_not_ready`, `pending_retry`, `error`, `missing`, `eligible`; verified live order `2605236301GU3V` tải PDF thành công qua Open Platform document flow.
- [x] Lazada API label: khi Order/Status Core chưa tới trạng thái có thể tải tem, UI/OMS phải hiển thị `not_ready` thay vì giữ lỗi cũ `label_download_error`; không dùng Seller Center fallback cho shop API.
- [x] OMS Product read-model: item TikTok/no-API thiếu ảnh/vốn phải enrich từ Product Core `products/product_variations` trước khi hiện nút `Cập nhật Vốn`; verified `584153607620625999` vốn `22.000đ`, ảnh thật và không còn nút cập nhật vốn.
- [x] OMS tracking drawer: khi Open Platform trả cả `PICKED_UP` và nhiều `ORDER_CREATED`, UI chỉ giữ event vận chuyển có giá trị và dedupe event tạo đơn để timeline gọn.
- [ ] Promotion price apply: Shopee API/TikTok/no-API bulk chỉnh giá khuyến mãi chưa pass checklist write-live. Trước khi bật phải kiểm endpoint chính thức, permission, payload model/item id, readback Seller Center/Open Platform và rollback/preview.

## Cập nhật 2026-05-23 - Shopee Discount live-write via Promotion Core

- [x] `/api/v2/discount/get_discount_list` dùng sync Discount Core cho shop Shopee API.
- [x] `/api/v2/discount/get_discount` dùng detail/readback Discount Core.
- [x] `/api/v2/discount/update_discount_item` allowlisted cho Promotion Core live-write, yêu cầu admin confirm, dry-run preview và readback.
- [x] Production live-write sample shop `chihuy1984`, SKU `400348_100_day_dai_100mm`: đổi `9.900đ -> 10.000đ` thành công, readback verified, sau đó revert `10.000đ -> 9.900đ` thành công.
- [x] Product Master flow giá KM không gửi/hiển thị stock proposal.
## 2026-05-25 - Chat/CSKH stale 22/05 hotfix

- [x] UI Chat/CSKH mặc định `Tất cả kênh`, không còn ẩn tin TikTok mới sau filter Shopee.
- [x] Nút `Tin mới` production gọi đầy đủ: Shopee/Lazada API sync và helper no-API Shopee/TikTok.
- [x] TikTok no-API helper từ UI dùng `browser_thread_detail`, Chrome visible/headful, viewport lớn để đọc thread thật.
- [x] Readback production thread TikTok có cả `sender_type=customer` và `sender_type=shop`, `last_synced_at=2026-05-25T15:42:57.326Z`.
- [x] Shopee/Lazada API endpoint chính thức quét thành công nhưng không có message mới: Shopee mỗi shop listed `30` và skipped unchanged `30`; Lazada listed `20` và skipped unchanged `20`.
- [x] Shopee no-API `khogiadungcona` profile webchat thật đang empty; helper trả `no_messages`, không fake dữ liệu.
## ADS luật tự động, Flash Sale tự động và dọn chương trình cũ 2026-05-25

- `ADS UI`: đã bỏ tab `Đồng bộ dữ liệu` và `Cài đặt`; ADS chỉ còn `Tổng quan`, `Sản phẩm cần xử lý`, `Luật tự động ADS`, `Nhật ký thao tác`. Đồng bộ chuyển thành nút `Kéo ADS` ở header và log trong nhật ký.
- `ADS automation Core`: thêm route lưu/readback/tắt khẩn cấp `/api/ads/automation/settings`, `/api/ads/automation/run-now`, `/api/ads/automation/emergency-stop`; dùng `ads_automation_settings` và `ads_action_logs`.
- `Shopee ADS endpoint đã dùng`: `/api/v2/ads/edit_manual_product_ads`, `/api/v2/ads/edit_auto_product_ads`, `/api/v2/ads/edit_manual_product_ad_keywords`; readback `/api/v2/ads/get_product_level_campaign_setting_info`. Delete/archive campaign/adgroup/product ads chưa mở nút nếu chưa có sample phá huỷ an toàn và readback riêng.
- `Lazada ADS endpoint đã kiểm trong reference`: `/sponsor/solutions/campaign/deleteCampaign`, `/sponsor/solutions/adgroup/deleteAdgroupBatch`, update campaign/adgroup hiện có. UI cleanup chỉ hiện live action khi adapter/readback production đủ.
- `Shopee Flash Sale tự động`: thêm màn trong Khuyến mãi sàn; endpoint tham chiếu chính thức gồm `/api/v2/shop_flash_sale/get_shop_flash_sale_list`, `/api/v2/shop_flash_sale/get_shop_flash_sale`, `/api/v2/shop_flash_sale/get_shop_flash_sale_items`, `/api/v2/shop_flash_sale/create_shop_flash_sale`, `/api/v2/shop_flash_sale/update_shop_flash_sale`, `/api/v2/shop_flash_sale/delete_shop_flash_sale`. UI cho lưu luật, khung giờ, sản phẩm và trạng thái `Chưa thể tự áp dụng` khi quyền/capability chưa đủ.
- `Shopee Discount/Voucher/Bundle/Add-On`: Discount update live đã có baseline; Voucher/Bundle/Add-On/Flash Sale chỉ mở ghi thật khi route có preview, quyền admin, action log và readback. Chương trình cũ không xoá khỏi Core lịch sử.
- `Lazada Promotion`: Voucher/Freeshipping/Flexicombo có activate/deactivate/update/remove theo reference LazOP; hiện vẫn khóa live-write nếu thiếu adapter payload/readback sample.
- `Open Platform check`: đã mở Shopee Open Platform và Lazada Open Platform bằng Chrome profile `E:\codex-chrome-profiles\shophuyvan-test`; không dùng Seller Center fallback cho shop API.

## 2026-05-26 - Promotion list visibility rule

- [x] Không phát sinh endpoint mới. Quy tắc hiển thị vận hành: danh sách chính của Promotion Core chỉ trả chương trình còn hiệu lực mặc định (`not_expired`).
- [x] Chương trình/voucher/Flash Sale hết hiệu lực giữ trong Core lịch sử; chỉ mở ở `Dọn chương trình cũ` và chỉ live-write xoá/kết thúc khi endpoint/capability hỗ trợ readback.

## 2026-05-26 - Shopee Flash Sale time slot endpoint

- [x] Endpoint đã kiểm và đã dùng: Shopee `/api/v2/shop_flash_sale/get_time_slot_id`.
- [x] Route nội bộ: `GET /api/discounts/shopee/flash-sale/time-slots?shop=&start_time=&end_time=`.
- [x] Shop API áp dụng: Shopee `chihuy1984`, `chihuy2309`, `phambich2312`; route bắt buộc `shop`, không chạy cho `Tất cả shop`.
- [x] Payload endpoint đọc khung giờ dùng `start_time`, `end_time`; readback trả `timeslot_id`, `start_time`, `end_time`.
- [x] Production readback mẫu: shop `chihuy1984`, khung `2026-05-26 20:00-22:00`, `timeslot_id=273882997665795`, UI hiển thị `Đã khớp khung giờ sàn`.
- [x] Live-write Flash Sale chưa mở trong lượt này; các endpoint create/update/delete Flash Sale vẫn phải đi qua preview, capability, action log và readback verified trước khi hiện nút ghi thật.
## Chat Core production readback 2026-05-26

- `Worker`: `shophuyvan-chat-api` đã deploy version cuối `e305fbca-38ca-4e54-b55c-e5872d37a2b3`; Durable Object `ChatRealtimeRoom` dùng `new_sqlite_classes`; cron fallback active `*/2 * * * *`.
- `Shopee webhook`: route `/api/chat/webhook/shopee` đã readback production: chữ ký sai trả `401 webhook_auth_failed`, chữ ký đúng trả `200 processed=1`, conversation có `sync_capability=webhook`, `send_capability=bridge`, `sync_health=ok`.
- `Browser helper`: route `/api/chat/browser-helper/push` đã readback production: thiếu token trả 401, token đúng ghi D1; WebSocket room cùng shop nhận message broadcast.
- `Cleanup`: smoke data `codex_*` đã xoá khỏi D1 production sau kiểm; không để dữ liệu test trong UI vận hành.

## Chat Core realtime/webhook/browser-helper 2026-05-26

- `Shopee Chat webhook`: Đã có route Worker `/api/chat/webhook/shopee`, HMAC header `X-Shopee-Signature`, secret `SHOPEE_WEBHOOK_SECRET`, normalize webhook payload về Chat Core. Trạng thái: code/local smoke pass; production cần cấu hình secret và webhook callback trên Open Platform.
- `Lazada Chat webhook`: Đã có route Worker `/api/chat/webhook/lazada`, HMAC header `X-Lazada-Hmac-Sha256`, secret `LAZADA_WEBHOOK_SECRET`, normalize webhook payload về Chat Core. Trạng thái: code/local smoke pass; production cần cấu hình secret và callback Lazada.
- `Realtime Chat Worker`: Đã thêm Durable Object `ChatRealtimeRoom`, binding `CHAT_REALTIME`, endpoint `/api/chat/realtime/connect?shop_id=...`, heartbeat 30 giây và broadcast message mới. Trạng thái: local import/smoke pass; cần deploy Chat Worker để tạo migration Durable Object.
- `Polling fallback`: Đã thêm cron `*/2 * * * *` và `scheduledSync` cho các conversation `polling_api/webhook` stale trên 5 phút. Trạng thái: code pass; production chạy sau deploy Chat Worker.
- `Browser helper`: Đã chuẩn hóa endpoint `/api/chat/browser-helper/poll` và `/api/chat/browser-helper/push`, token `X-Helper-Token`/`BROWSER_HELPER_SECRET`. Route cũ `/api/chat/automation-ingest` đã xoá sau khi migrate hai caller Python thật; không giữ wrapper mỏng, không 410.

## Chat/CSKH UI production replacement 2026-05-26

- [x] UI endpoint: `https://shophuyvan-analytics.nghiemchihuy.workers.dev/pages/chat-cskh.html`.
- [x] Static deploy: `shophuyvan-analytics` version `3f82e8e9-8ae3-4a2f-ad44-e8de70bfad93`.
- [x] Verification: Chrome profile `E:\codex-chrome-profiles\shophuyvan-test`, mobile `390x844`, tablet `820x1180`, desktop `1366x900`, no horizontal overflow, `hasOldShell=false`, `consoleErrors=[]`, `httpErrors=[]`, realtime connected.
- [x] API shop flow: UI renders Chat Core `sync_health`, `send_capability`, `sync_capability` as Vietnamese operational labels; actual sync/send remains in Chat Worker/Core.
- [x] No-API flow: UI shows browser-helper/manual status and saves manual draft through Chat Worker; no API label is shown for TikTok/manual shops.
- [x] Cleanup: old `apps/fe/js/dashboard/chat/*` runtime replaced, no thin wrapper/410; production test draft rows removed from D1.
#### 2026-05-26 - Shopee Chat Core Overhaul follow-up

- `Đã dùng`: `/api/v2/sellerchat/get_conversation_list`, `/api/v2/sellerchat/get_message`, `/api/v2/sellerchat/get_one_conversation` qua bridge chính `huyvan-worker-api`; fallback tên khách từ Order Core khi SellerChat thiếu `buyer_name/to_name`.
- `Đã kiểm`: sync production shop `170044686` trả `200`, `pulled_conversations=10`, `pulled_messages=14`, không còn lỗi `Too many subrequests`; UI production hiển thị `tdminh82 | GIA DỤNG HUY VÂN` và tin ngày `26/05/2026`.
- `Thiếu quyền/thiếu dữ liệu`: một số hội thoại mới trong bằng chứng mobile (`kalot4991`, `phamdatthao273`, `anhvunhi1995`, `tiendatfarm`) không trả đủ qua SellerChat API hiện tại hoặc không xuất hiện trong list API production. Chưa tìm thấy endpoint Shopee public khác trả inbox mobile đầy đủ hơn.
- `Fallback bắt buộc`: cần Shopee browser-helper/Seller Center inbox summary cho các row API thiếu tên/preview; dữ liệu helper phải ghi về Chat Core, UI chỉ render lại read-model.
## 2026-05-26 - Chat/CSKH order/product panels, Lazada IM fix

- [x] Shopee Chat vẫn dùng endpoint chính thức đã nối: `/api/v2/sellerchat/get_conversation_list`, `/api/v2/sellerchat/get_message`, `/api/v2/sellerchat/get_one_conversation`, `/api/v2/sellerchat/send_message`. Lượt này không thêm endpoint Shopee mới.
- [x] Lazada Chat endpoint đã dùng và readback production: `/im/session/list`, `/im/message/list`. Bridge đã bổ sung `start_time` cho `/im/message/list` vì Lazada bắt buộc tham số này.
- [x] Lazada production readback: `POST /api/chat/sync` `channel=lazada`, `shop_id=200166591213`, `limit=5`, `page_size=5` trả `pulled_conversations=5`, `pulled_messages=12`, `saved_messages=12`; attempts `/im/session/list` và `/im/message/list` đều HTTP 200/code `0`.
- [x] Chat UI order/product không gọi endpoint sàn trực tiếp; đọc Order Core `/api/core/orders/by-conversation/*` và Product Core `/api/core/products/search`.
- [x] Shop không API/manual vẫn không gắn nhãn API; dữ liệu browser/helper đi vào Chat Core qua endpoint helper chuẩn, UI render read-model.
- [ ] Web push nền thật cho điện thoại chưa có VAPID subscription server-side trong lượt này; hiện đã có nút xin quyền và service worker notification khi trang/polling nhận tin mới, nhưng cần phase riêng nếu muốn push khi trang không mở.
### 2026-05-27 - Customer Contact Endpoints

- Lazada: `GetOrders/GetOrder` (`/orders/get` trong Worker Lazada client) có customer details và `address_shipping` gồm tên/phone/address. Trạng thái: đã dùng để ghi Customer Core cho shop API `kinhdoanhonlinegiasoc@gmail.com`.
- TikTok: chưa dùng Open Platform cho customer contact; dùng Seller Center runner visible/headful vì dữ liệu nằm trong trang chi tiết đơn. Trạng thái: runner `sync_detail` ghi về Order/Tracking Core, Customer Core rebuild lại.
- Fallback: không dùng Lazada Seller Center/browser fallback cho shop API; TikTok vẫn là local automation có log/job vì chưa có endpoint Worker API chính thức trong hệ thống hiện tại.
- 2026-05-28: Customer Core rebuild chỉ append/merge vào `marketplace_customer_contacts`; không xóa dữ liệu cũ trước khi quét lại. Không phát sinh endpoint marketplace mới.
## 2026-05-27 - Dashboard daily Finance Core coverage

- [x] Không thêm endpoint sàn mới cho lỗi dashboard daily; đã xác định root cause là `order_analytics` thiếu row sau khi Warehouse `orders_v2` đã có đủ shop.
- [x] Route nội bộ đã dùng: `/api/order-analytics/rebuild`, `/api/order-analytics/finance-core`, `/api/revenue-by-day`, `/api/profit-by-day`, `/api/top-shop`, `/api/top-platform`.
- [x] Shopee API shops `chihuy1984`, `chihuy2309`, `phambich2312`: dữ liệu ngày `2026-05-27` được rebuild vào Finance Core và hiển thị lại trên dashboard.
- [x] Lazada API shop `kinhdoanhonlinegiasoc@gmail.com`: order ngày `2026-05-27` được rebuild vào Finance Core; income/settlement vẫn đánh dấu estimate nếu Lazada Finance chưa có dòng confirmed trong Core.
- [x] TikTok `0909128999`: giữ luồng non-API/estimate hiện có; không gắn nhãn API.
- [x] Deploy production đã kiểm: Worker API `d28e16bc-be66-4484-8aa2-5544cd6d6506`, static UI `2f25784f-7a87-4723-bb50-528808287d04`; bảng daily pass desktop/tablet/mobile với 5 shop và tổng `28` đơn / `3.029.000 đ`.
- [ ] Việc chuyển các `estimated_orders` còn lại sang confirmed cần phase sync Finance/settlement riêng, không xử lý bằng patch UI.
- 2026-05-27 Chat/CSKH Shopee:
  - [x] `POST /api/v2/sellerchat/send_message` gửi text chủ động có `content.order_sn` khi Chat Worker nhận `order_id`.
  - [x] Bridge giữ fallback `source_type=order` + `source_content.order_sn` và thêm route thẻ đơn Shopee `/api/internal/chat-bridge/shopee/messages/order-card`.
  - [x] Production readback đơn `260527GANU1XNM`: message mới `status=sent`, `platform_message_id=2415648592711041393`, UI desktop hiện `Đã gửi` và không còn lỗi `must contain order information`.
  - [ ] Audit riêng lỗi encoding/mojibake cũ ở một số file/UI copy Chat và assertion TikTok trong `scripts/test-order-chat-target.mjs`.

## 2026-05-28 - Flashdeal auto endpoint wrapper

- [x] Route nội bộ mới: `GET /api/discounts/flash-deal/timeslots?shop=`, `POST /api/discounts/flash-deal/items/add`, `GET /api/discounts/flash-deal/items?shop=&timeslot_id=`.
- [x] Settings/log route: `/api/discounts/flash-auto/settings`, `/settings/all`, `/logs`, `/run`; D1 tables `flash_auto_settings`, `flash_auto_logs`.
- [x] Endpoint đã triển khai theo yêu cầu: `/api/v2/flashdeal/get_time_slot_id`, `/api/v2/flashdeal/add_flash_deal_item`, `/api/v2/flashdeal/update_flash_deal_item`, `/api/v2/flashdeal/delete_flash_deal_item`, `/api/v2/flashdeal/get_flash_deal_item`.
- [x] Shop API seed: Shopee `chihuy1984`, `chihuy2309`, `phambich2312` enabled; Lazada `kinhdoanhonlinegiasoc` disabled.
- [ ] Production live-write chưa verified: `chihuy1984` trả `error_not_found` khi gọi timeslot `/api/v2/flashdeal/get_time_slot_id`; cần kiểm lại official path/quyền Flashdeal trước khi coi là endpoint đã sẵn sàng.
- [ ] Chưa mở fallback Seller Center cho shop API; fallback chỉ được xét sau khi Open Platform xác nhận endpoint không tồn tại hoặc thiếu quyền.
## 2026-05-28 - Chat/CSKH realtime, AI, push, settings

- Chat Worker `/api/chat/*`: thêm `GET /api/chat/ai/status`, `GET/POST /api/chat/ai/knowledge`, `DELETE /api/chat/ai/knowledge/:id`, `POST /api/chat/ai/approve`, `GET /api/chat/settings/stats`, `POST /api/chat/settings/reset`, `POST /api/chat/settings/cleanup`, `POST /api/chat/settings/export`.
- Shopee/Lazada Chat webhook: sau persist webhook gọi immediate sync theo `channel + shop_id`; nếu endpoint bridge/token thiếu quyền vẫn ghi capability/error từ adapter, không fake sent.
- Push notification: giữ endpoint `/api/chat/notifications/status|subscribe|unsubscribe|test`, bổ sung APNs headers/retry để không đánh dấu dead sau lỗi đầu.
- AI/Gemini: Gemini là provider mặc định nhưng chỉ hoạt động khi có key; nếu thiếu key trả `ai_status=unconfigured`, không gửi tự động khi chưa đủ capability/rule.
- TikTok/Facebook/Zalo: chưa thêm Chat API chính thức mới; TikTok vẫn browser helper/polling fallback, Facebook/Zalo skeleton chưa triển khai adapter.
- Deploy/readback: Chat Worker `7af1b583-f3ca-4204-af47-95e55c23dd00`, static `39d860d1-3103-47de-a699-94e2d2047870`; production Chat UI và Settings pass desktop/tablet/mobile, không mojibake, không tràn ngang.
## 2026-05-28 - Chat outbound policy check

- [x] Route nội bộ đã thêm: `POST /api/chat/policy/check` trên Chat Worker.
- [x] Mục đích: kiểm tra nội dung chat trước khi gửi; chặn định dạng số điện thoại Việt Nam và định dạng website/domain bên cạnh danh sách từ khóa cấm.
- [x] Shop API và shop không API dùng chung Chat Core policy; không phát sinh endpoint marketplace mới và không đổi Shopee/Lazada/TikTok bridge.
- [x] Backend send path `POST /api/chat/messages/send` vẫn là chốt chặn cuối cùng trước khi lưu/gửi adapter.
- [ ] Cần deploy/readback production sau lượt code này: gọi `/api/chat/policy/check` với `0909128999 shophuyvan.vn`, kiểm Chat UI không append/gửi, kiểm Settings preview bị chặn.
### 2026-05-28 - Product Core search tên dài cho Chat AI

- `Phạm vi`: Product Core read-only search dùng bởi Chat AI context; không thêm endpoint marketplace mới.
- `Đã dùng`: Worker chính `GET /api/core/products/search`, `GET /api/core/products/by-sku/:sku`; Chat Worker dry-run `POST /api/chat/ai/suggest` để readback warnings.
- `Đã sửa`: Product search tách token an toàn, ưu tiên token mã/SKU như `K75`, không còn D1 `LIKE or GLOB pattern too complex` khi tên sản phẩm dài.
- `Shop có API`: Lazada `kinhdoanhonlinegiasoc@gmail.com` đọc dữ liệu đã sync vào Product Core/snapshot; không dùng Seller Center fallback.
- `Shop không API`: không đổi fallback; vẫn đọc dữ liệu đã nhập Warehouse/Product Core.
- `Thiếu quyền/không có endpoint`: không phát sinh `api_permission_missing`, `token_scope_missing`, `endpoint_not_available`.
- `Deploy/verify`: Worker chính `204213c9-6b18-4b49-8c73-50712e17ec4c`; production query dài K75 trả `matched_product_core`; Chat AI context `core_context_warnings=[]`.
### 2026-05-28 - Zalo Chat browser-helper local

- `Phạm vi`: Zalo Web local helper trong `E:\tool zalo`, profile Chrome automation trong `E:\shophuyvan-python-automation\profiles\browser`, Chat Worker browser-helper endpoint; không deploy Worker/static.
- `Đã dùng`: `POST /api/chat/browser-helper/push` của Chat Worker riêng `shophuyvan-chat-api`, `channel=zalo`, `connector=zalo_local_browser`, token `X-Helper-Token` từ `browser_helper.local.json`.
- `Đã kiểm`: 2 profile visible/headful `Zalo_Shop_Huy_Van_0909128999` port `9241`, `Zalo_Nghiem_Chi_Huy_0848881111` port `9242`; local slots ok, bridge configured, auto-send enabled.
- `Readback`: push thật từ Zalo Shop Huy Vân vào Chat Core lưu 3 hội thoại / 26 tin; endpoint readback `GET /api/chat/conversations?channel=zalo&shop_id=zalo_shop_huy_van_0909128999&limit=3` trả `shop_chat_mode=browser_helper`, `send_capability=manual_only`, `sync_capability=browser_helper`.
- `Deploy/verify`: static `shophuyvan-analytics` version `21793972-66ab-4465-8d1c-209543a70f91`, chỉ upload Chat page/CSS; production UI desktop/tablet/mobile thấy hội thoại Zalo trong danh sách chung, badge Zalo màu xanh, không tràn ngang.
- `Local automation`: port fallback đã có cho server/batch; chu kỳ quét tự động có setting `automation.scanIntervalSeconds`; cửa sổ Zalo compact ở góc trên theo setting; launcher ưu tiên Chrome để giữ profile login.
- `Auto-send`: bật local nhưng guard bắt buộc bỏ qua group, family/internal, system/stranger, khiếu nại, hoàn tiền, bảo hành, pháp lý, dữ liệu nhạy cảm và tin không phải nhu cầu bán hàng rõ.
- `Shop có API`: không đổi Shopee/Lazada/TikTok API/bridge hiện có; Zalo chưa gắn official API.
- `Fallback`: Zalo dùng browser-helper local vì chưa nối official Zalo chat API. Không fake trạng thái `sent` trong Chat Worker adapter.
- `Còn mở`: cần production UI readback khi có message Zalo mới được push vào Chat/CSKH.
### 2026-05-28 - Zalo scan setting + history sync

- `Phạm vi`: Zalo social chat qua local browser helper; không thêm endpoint marketplace official mới.
- `Đã dùng`: `POST http://127.0.0.1:8794/api/shophuyvan-chat/sync-history`, `POST http://127.0.0.1:8794/api/shophuyvan-chat/send`, Chat Worker `/api/chat/browser-helper/push`.
- `Đã sửa`: Settings hiển thị/sửa được `Quét Zalo tự động`; Chat/CSKH có Sync Zalo; helper history sync push tin cũ vào Chat Core và khóa dedupe ổn định để bấm lại không nhân đôi.
- `Shop có API`: Shopee/Lazada/TikTok không đổi endpoint official/capability.
- `Shop không API/social`: Zalo dùng local browser-helper, source `zalo_local_browser`, capability `browser_helper/manual_only`; Facebook vẫn là social riêng, chưa live bridge.
- `Thiếu quyền/không có endpoint`: không phát sinh `api_permission_missing`, `token_scope_missing`, `endpoint_not_available`. Gửi Zalo hội thoại người lạ bị `zalo_requires_friend`, cần kết bạn trước hoặc chọn hội thoại đã kết bạn.
- `Verify`: helper `8794` PID `23452`, 2 slot ok, sync lịch sử hội thoại `8195779656939267821` push ok; test gửi `ok` bị Zalo Web chặn đúng lý do. Static deploy `bfa32e29-cc0c-497a-bcb4-c5a5ee71716c`; Settings/Chat production pass desktop/tablet/mobile `overflowX=false`.

## 2026-05-29 - Flash Auto UI polish (không đổi endpoint)

- Phạm vi: chỉ chỉnh UI `Khuyến mãi sàn > Flash Sale tự động`.
- Endpoint đã kiểm: giữ nguyên các route hiện có `/api/discounts/flash-auto/settings/all`, `/api/discounts/flash-auto/settings`, `/api/discounts/flash-auto/run`, `/api/discounts/flash-auto/logs`, `/api/discounts/flash-deal/timeslots`.
- Đã dùng: không đổi allowlist/adapter/write path.
- Thiếu quyền: không phát sinh mới.
- Không có endpoint: không phát sinh mới.
- Fallback: không đổi.

## 2026-05-30 - Flash Auto shared-template multi-shop

- Phạm vi: mở rộng batch cho cài đặt/chạy Flash Sale tự động, vẫn giữ Core contract theo shop.
- Endpoint đã kiểm:
  - `POST /api/discounts/flash-auto/settings/batch`
  - `POST /api/discounts/flash-auto/run/batch`
  - Route cũ giữ nguyên: `/api/discounts/flash-auto/settings`, `/api/discounts/flash-auto/run`.
- Đã dùng:
  - UI `Khuyến mãi sàn > Flash Sale tự động` gọi `settings/batch` để áp 1 template cho nhiều shop.
  - UI gọi `run/batch` để chạy song song nhiều shop, trả `results[] + summary`.
- Deploy:
  - Worker `huyvan-worker-api` version `f70be183-0519-4917-a421-35cb1432c919`.
  - Static `shophuyvan-analytics` version `c2287853-c238-401b-8b29-8031d95cbc3f`.
- Verify:
  - `settings/batch` sample 2 shop pass (`status=ok`, `summary.success=2`).
  - `run/batch` payload rỗng trả `400` đúng guard input.
  - Trang production `promotions.html` đã load asset cache-bust mới `flash-auto-20260530c`.
- Thiếu quyền:
  - Batch run giữ báo cáo theo từng shop; trường hợp thiếu scope vẫn phản ánh `api_permission_missing`/`token_scope_missing` và tổng hợp vào `summary.permission_denied`.
- Không có endpoint:
  - Không phát sinh `endpoint_not_available` mới trong phase này.
- Fallback:
  - Nếu người dùng chỉ chọn 1 shop, UI fallback về flow cũ single-shop để giữ ổn định.
### 2026-05-30 - Local automation runtime hardening (tab dedupe + compact window)

- [x] No-API browser helper/report runtime now enforces one-tab-per-feature key for TikTok `0909128999` and Shopee no-API `khogiadungcona`.
- [x] Duplicate tabs with same feature key are auto-closed in runtime.
- [x] Auto chat sync requests compact top window `620x480` to reduce operator obstruction.
- [x] Live readback captured from `/chat-sync`: both TikTok and Shopee no-API returned `window_bounds` exactly `620x480`.
- [x] Stable tab count confirmed in rerun snapshot: TikTok `2->2`, Shopee `2->2`.
- [ ] Long-duration scheduler proof pending (>=30 minutes repeated cycle).

### 2026-05-31 - Zalo local helper dedupe readback

- [x] So sánh trực tiếp Zalo Web thật qua CDP `9241/9242`, không chỉ đọc log.
- [x] Local helper canonical hóa ngày và reconcile alias theo snapshot DOM trước khi push.
- [x] Bridge payload bỏ fallback index DOM, compact dòng cùng nội dung/cùng phút và ưu tiên ngày explicit.
- [x] Chat Core read-model ẩn alias legacy `zalo_local_browser`; không chạy cleanup rộng D1.
- [x] Profile `Shop Huy Vân`: DOM/local `2`, repeated sync `saved_messages=0`, `skipped_duplicates=2`.
- [x] Profile `Nghiem Chi Huy`: DOM/local `15`, repeated sync `saved_messages=0`, `skipped_duplicates=15`.
- [x] Race-lock theo từng Zalo account: 2 request sync-history `Cậu Hoàng` chạy đồng thời đều `messages_synced=15`, `saved_messages=0`, `skipped_duplicates=15`; scraper abort nếu active thread chưa khớp id/title.
- [x] Snapshot rồi xóa đúng `2` D1 rows nhiễm chéo thread đã xác minh; SQL readback `remaining=0`. Không cleanup rộng alias legacy.
- [x] Production Chat/CSKH UI qua ShopHuyVan Chrome CDP `9333`: `Kỹ Thuật Hoàng Nhân` render `3` rows (`2` Zalo + `1` draft), `Cậu Hoàng` render đúng `15` rows. Helper `8794` PID `49548` giữ ổn định qua chu kỳ scheduler.
- [x] Deploy riêng Chat Worker `shophuyvan-chat-api` version `7d11d783-edd8-4bf1-9ca6-8d58eb80eda6`.
- [ ] Physical D1 alias cleanup chỉ làm ở task riêng sau snapshot + dry-run + batch giới hạn.

### 2026-05-31 - Zalo explicit-date alias cleanup + local-network gate

- [x] Hai profile Chrome Zalo thật dùng đúng folder automation, visible/headful: CDP `9241/9242`.
- [x] Fingerprint attachment và payload compaction không còn phụ thuộc random attachment id hoặc index DOM.
- [x] Thread `Đặng Kim Dũng / 1025381407093463190` cleanup giới hạn sau snapshot: xóa đúng `6` message alias cũ + `1` conversation alias rỗng.
- [x] D1/API/UI readback còn đúng `2` rows theo thứ tự; sync lặp `saved_messages=0`, `skipped_duplicates=2`.
- [x] Chat Worker riêng deploy version `6e4636bc-a3bb-4763-ac6b-c9ff96041967`.
- [x] Static deploy version `235eb070-6f07-4d40-9673-d691a490d6a9` với `targetAddressSpace: 'local'`.
- [ ] Operator cấp quyền Local Network Access cho domain production rồi bấm lại Sync để chốt UI-to-helper POST.
- [ ] Audit alias Zalo legacy khác theo snapshot + dry-run + bounded batch; không cleanup rộng tự động.

### 2026-05-31 - Zalo Cậu Hoàng wrong-thread source fix

- [x] Kiểm trực tiếp Zalo Web thật bằng profile `Zalo_Nghiem_Chi_Huy_0848881111` CDP `9242`; thread `Cậu Hoàng` không có nội dung `STORE DETAILING`.
- [x] Helper bridge chỉ push row có cả explicit date và visible time; không còn sinh `date_unknown`, `time_unknown`, `_pos_` thành message mới.
- [x] Sync/send xác nhận active conversation id trước khi scrape/type/send để tránh râu ông này cắm cằm bà kia khi scheduler đổi thread.
- [x] Chat Core platform message id dedupe đã scoped theo shop; same id ở 2 shop Zalo không merge chéo.
- [x] Snapshot rồi cleanup giới hạn: xóa đúng `25` bad aliases, sau đó xóa thêm reinserted `STORE DETAILING` rows theo bounded passes `4 + 2` sau khi dọn local store.
- [x] Exact sync `Cậu Hoàng`: `messages_synced=15`, `saved_messages=0`, `skipped_duplicates=15`.
- [x] Production API readback sau sync và sau một chu kỳ scheduler: `count=15`, `badHits=0`.
- [x] Production UI CDP `9333`: thread `Cậu Hoàng` hiện `Đồng bộ ổn`, không còn `STORE DETAILING/date_unknown/time_unknown/_pos_`.
- [x] Deploy riêng Chat Worker `shophuyvan-chat-api` version `2fae05ce-a97e-4557-9547-28b10e86cea4`.
- [ ] Security hardening local helper auth/CORS/auto-send policy tách phase riêng; không cleanup rộng D1 ngoài snapshot + dry-run + bounded batch.

### 2026-05-31 - Zalo local helper origin hardening

- [x] Added local helper origin allowlist module: `E:\tool zalo\src\services\localHelperSecurity.js`.
- [x] Removed wildcard CORS behavior for browser-origin calls; allowed production/loopback origins are echoed explicitly.
- [x] Evil origin preflight returns `403 origin_not_allowed`, with no `Access-Control-Allow-Origin` and no `Access-Control-Allow-Private-Network`.
- [x] Oversized JSON body returns `413 body_too_large`.
- [x] Helper binds to `127.0.0.1` by default; LAN bind requires explicit env.
- [x] Restarted helper only by node listener PID; current PID `20284`, port `8794`, CDP slots `9241/9242` ok.
- [x] Zalo data regression after scheduler: `Cậu Hoàng` remains `count=15`, `badHits=0`.
- [ ] Full token auth for production-browser calls requires a separate design because frontend-held secrets are not safe.




### 2026-05-31 - Video Center UI responsive split (UI-only)

- [x] Phạm vi xác nhận: chỉ frontend UI/CSS + 1 external homepage link, không đổi endpoint/backend.
- [x] Endpoint đã dùng: giữ nguyên endpoint hiện hữu, không thêm allowlist mới.
- [x] Endpoint thiếu quyền: không phát sinh `api_permission_missing`/`token_scope_missing` trong scope này.
- [x] Endpoint không có: không phát sinh `endpoint_not_available` mới.
- [x] Fallback: không thay đổi fallback shop không API.
- [ ] Verify production desktop/tablet/mobile: còn mở do blocker môi trường Playwright extension chưa sẵn sàng.

### 2026-05-31 - ADS sidebar relabel Import -> Trang chủ, add Video shortcut

- [x] UI-only: chỉnh menu sidebar tại `apps/fe/pages/ads.html`.
- [x] Đưa `Trang chủ` lên trên cùng.
- [x] Thêm `Trung tâm video` để thao tác nhanh.
- [x] Không phát sinh endpoint mới.
- [ ] Verify production desktop/tablet/mobile còn mở trong lượt này.

### 2026-05-31 - Home quick access add Video card

- [x] UI-only: thêm shortcut `Trung tâm video` trên trang chủ nhanh.
- [x] Không đổi backend/endpoint.
- [ ] Verify production desktop/tablet/mobile sẽ thực hiện sau deploy static.

### 2026-05-31 - Video runtime fix (loader chunk path)

- [x] UI-only: sửa loader chunk path trong `video-dashboard.js`.
- [x] Không đổi backend/endpoint.
- [ ] Verify production click-flow pending deploy.

### 2026-05-31 - Video Dashboard redesign responsive

- [x] UI-only: chỉnh CSS/HTML/JS render cho Video Dashboard.
- [x] Không đổi endpoint/backend.
- [ ] Verify production desktop/tablet/mobile: pending sau deploy static.

### 2026-05-31 - Video UI cleanup (remove Shop/API tab + packing video resize)

- [x] Scope xác nhận: UI-only, không thay đổi endpoint/adapter.
- [x] Endpoint đã dùng: giữ nguyên endpoint video hiện có.
- [x] Thiếu quyền: không phát sinh `api_permission_missing`/`token_scope_missing`.
- [x] Endpoint không có: không phát sinh `endpoint_not_available` mới.
- [x] Fallback shop không API: giữ nguyên luồng cũ.
- [ ] Verify production desktop/tablet/mobile: pending sau deploy static.

## 2026-05-31 - Shopee Video endpoint check (upload/edit/delete/list/detail)

- Endpoint đã kiểm: Shopee Video Media + Video write/read endpoints trong scope upload/edit/delete/list/detail.
- Đã dùng: đầy đủ route theo checklist hiện hành, không phát hiện thiếu endpoint mới cho scope này.
- Thiếu quyền/token: chưa ghi nhận thêm case mới trong lượt này.
- Không có endpoint: chưa phát sinh `endpoint_not_available` mới cho scope này.
- Fallback: không dùng Seller Center fallback cho shop API trong flow xử lý này.

### 2026-05-31 19:50 - TikTok/Shopee non-API recheck

- Endpoint checked:
  - GET /api/jobs?mode=monitor
  - GET /api/jobs?ids=...
  - PATCH /api/jobs/{id}
  - GET /api/orders?platform=<>&shop=<>
- Endpoint used: yes (existing).
- Permission issue: none observed.
- Endpoint not available: none in this run.
- Fallback reason: none (non-API flow stayed in browser-helper runner pipeline).

### 2026-06-01 - Order push iPhone follow-up

- [x] Verify order-event callsites still trigger `notifyOrderSubscribers` in sync/import flows.
- [x] Replace disabled notifier path with active bridge to Chat Worker push endpoint.
- [x] Standardize frontend push registration path to `/sw.js` to avoid split service-worker scope.
- [ ] Deploy Worker API + static FE to production.
- [ ] Verify iPhone real device: lock screen, banner, notification center, foreground/background.
- [ ] Confirm iOS permission status is granted on Safari Home Screen install.
### 2026-06-02 - Order push iPhone deploy + production readback

- Scope: Order push/OMS/Chat notification only; khong them endpoint marketplace moi.
- Code da deploy:
  - `apps/fe/js/modules/oms-notifications.js`: OMS page tu dang ky PushSubscription qua Chat Worker, co guard iPhone standalone/Home Screen, co targeted push test cho dung thiet bi hien tai.
  - `apps/fe/js/dashboard/chat/notifications.js`: chan iPhone Safari mode va hien ro loi test push khi dang ky nen khong pass.
  - `apps/fe/pages/oms-dashboard.html`: them manifest + apple web-app meta/icon de Home Screen app cua OMS du dieu kien push tren iPhone.
  - `apps/chat-worker-api/src/core/push-notification-core.js`: reject subscription thieu `p256dh/auth`, bo branch APNs header custom, normalize payload order/chat truoc khi gui.
  - `apps/chat-worker-api/src/routes/notifications.js`: route test/subscription dung payload normalize moi.
  - `apps/worker-api/src/routes/marketplace-chat/index.js`: order change bridge sang `POST /api/chat/notifications/test` tren Chat Worker.
- Deploy production:
  - Chat Worker `shophuyvan-chat-api`: `21ac05fa-e55b-4f47-965f-6e180f11958c`.
  - Worker chinh `huyvan-worker-api`: `ff4b0c8a-39dd-4b80-93e1-7ee93d914285`.
  - Static `shophuyvan-analytics`: `6d15c647-e43e-44ab-b2c8-34a598d4fc8c`.
- Production readback pass:
  - `GET https://shophuyvan-chat-api.zacha030596.workers.dev/api/chat/notifications/status` -> HTTP 200, `subscriptions=6`.
  - `POST https://shophuyvan-chat-api.zacha030596.workers.dev/api/chat/notifications/test` voi payload order smoke -> `sent=6`, `failed=0`.
  - `POST /api/chat/notifications/subscribe` voi subscription thieu key -> HTTP 400, `error_code=missing_push_keys`.
  - Static asset production da co marker moi: `CHAT_PUSH_API`, `requiresStandaloneIosPush`, `sendOmsPushTest`, `manifest.webmanifest`, `apple-mobile-web-app-capable`.
  - Route legacy tren Worker chinh van dung 410 cho `/api/chat/*`; push production di qua Chat Worker rieng.
- Browser verification production:
  - Da mo profile `E:\codex-chrome-profiles\shophuyvan-test` qua CDP `9333`.
  - Production OMS redirect ve `pages/login?next=...`; profile nay chua co session dang nhap hop le trong luot verify nen khong the click-flow sau login.
- Con mo / blocker that su:
  - Chua verify lock screen/banner/notification center tren iPhone vat ly trong Home Screen mode.
  - Chua trigger 1 order event that tren production de doc readback end-to-end tu OMS Core -> Worker chinh -> Chat Worker -> thiet bi.
  - Neu user dang test bang Safari tab thuong tren iPhone, push ngoai man hinh van khong hien; can Add to Home Screen va cap quyen Notification trong iOS Settings.
## 2026-06-03 - Chat contact ingest vào Customer Core

- Phạm vi: Customer Database/CRM lead từ hội thoại; không thêm endpoint marketplace official mới.
- Endpoint đã dùng trong code:
  - Worker chính `POST /api/customers/marketplace/chat-ingest` để ghi contact vào Customer Core.
  - Chat Worker `POST /api/chat/customer-contacts/backfill` để quét message cũ đã có trong Chat Core.
- Shopee/Lazada/TikTok/Zalo/Facebook:
  - Shop có API giữ nguyên API/bridge chat hiện có, không chuyển sang Seller Center fallback.
  - Shop không API/social chỉ được lưu contact nếu message đã vào Chat Core và có dữ liệu khách đã reveal thật.
  - Zalo/Facebook vẫn là social/local/bridge riêng, không gắn nhãn official marketplace endpoint.
- Quyền/token:
  - Route ghi yêu cầu secret nội bộ; thiếu secret phải báo `customer_contact_bridge_secret_not_configured` hoặc `customer_contact_bridge_forbidden`.
  - Không phát sinh `api_permission_missing`, `token_scope_missing`, `endpoint_not_available` cho endpoint sàn trong scope này.
- Fallback: không dùng Seller Center fallback; không ghi masked phone/address như plaintext.
- Trạng thái: deployed + production readback pass. Public ingest không có secret trả `403`; backfill production Zalo/Shopee/Lazada đều `failed=0`; Customer Database summary production `total=57`, social `zalo_total=2`, `facebook_total=0`.
- Zalo guard đã kiểm: lọc broadcast doanh nghiệp và address lệch conversation; contact key chat có `buyer:<id>` để không merge chéo khi cùng SĐT xuất hiện trong nhiều hội thoại.

## 2026-06-03 - Order push text tieng Viet cho OMS/iPhone

- [x] Worker order notifier uu tien display_status_vi va status_label_vi tu Order Core.
- [x] Fallback status text cua Worker doi sang tieng Viet co dau.
- [x] OMS foreground/local notification uu tien display_status_vi va status_label_vi.
- [x] Deploy Worker chinh production (fdc383b1-5b2b-4646-9807-b3164e3fe7bb).
- [x] Deploy static production (da3ed98b-157a-436d-97da-5c0b10a1348c).
- [x] Verify GET /api/orders/changes dang tra display_status_vi tieng Viet.
- [x] Verify push smoke payload co dau qua Chat Worker (sent=6, failed=0).
- [ ] Verify iPhone vat ly: lock screen/banner/notification center sau 1 order event that.
### 2026-06-04 - External Shopee full-product content/media read API

- [x] Checked official Shopee product read endpoints: `get_item_list`, `get_item_base_info`, `get_model_list`, `get_item_extra_info`
- [x] Wired authenticated external route for operator/integration use: `/api/external/shopee/products/full`
- [x] Added single-item detail route: `/api/external/shopee/products/full/:itemId`
- [x] Response includes content/media fields for prompt pipelines: description, images, video, model images/text
- [x] Shop API only; no Seller Center fallback
- [ ] Production deploy/readback verify
