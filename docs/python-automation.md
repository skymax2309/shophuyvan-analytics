# Cập nhật 2026-05-28 - Zalo local send bridge

- Zalo Chat Core dùng local helper `E:\tool zalo` chạy headful/visible với 2 profile chuẩn trong `E:\shophuyvan-python-automation\profiles\browser`: `Zalo_Shop_Huy_Van_0909128999` và `Zalo_Nghiem_Chi_Huy_0848881111`.
- Endpoint gửi từ Chat/CSKH vào helper: `POST http://127.0.0.1:8794/api/shophuyvan-chat/send`. Helper map `shop_id` về account Zalo, gửi qua CDP, lưu local message, rồi push lại Chat Core bằng `/api/chat/browser-helper/push`.
- Helper hiện có port fallback, nhưng production UI mặc định gọi `8794`; nếu cổng này bận thì `start-zalo-tool.bat`/server tự xoay port, lúc đó cần set `window.SHOPHUYVAN_ZALO_HELPER_BASE` nếu operator muốn UI trỏ sang port mới.
- Kiểm thật 2026-05-28: `GET /api/automation/slots` trả `port=8794`, 2 slot connected, `autoSendEnabled=true`, `aiRuntimeReady=true`, `shophuyvanChatBridge.configured=true`; Chrome profile Zalo vẫn `headless=false`, cửa sổ 520x760 ở góc trên.
- Zalo/Facebook là kênh social riêng, không áp dụng restricted keyword policy kéo khách ra ngoài sàn. Shopee/Lazada/TikTok vẫn giữ policy marketplace.

# Cập nhật 2026-05-27 - Chat no-API scheduled sync

- Scheduler local helper/Radar đã có nhánh `sync_chat` cho Chat no-API. Cấu hình chuẩn sau kiểm: `auto_order_enabled`, `auto_status_enabled`, `auto_detail_enabled`, `auto_finance_enabled`, `auto_label_enabled`, `auto_chat_enabled` đều bật; `chat_min_minutes=10`, `chat_max_minutes=20`.
- TikTok no-API `0909128999` dùng profile `E:\shophuyvan-python-automation\profiles\browser\shophuyvan-runner-tiktok`; Shopee no-API `khogiadungcona` dùng profile `E:\shophuyvan-python-automation\profiles\browser\HuyVan_Bot_Data_khogiadungcona`.
- Chat helper chạy headful/visible, CDP port cố định theo profile, log `headless=false`; không kill Chrome chung, chỉ đóng PID thuộc profile automation đang dùng khi cần restart CDP.
- Local helper `/chat-sync` post về Chat Worker `/api/chat/browser-helper/push`, API base production `https://shophuyvan-chat-api.zacha030596.workers.dev`; token đọc từ `E:\shophuyvan-python-automation\data\config\browser_helper.local.json` để tránh env stale.
- Kiểm thật ngày 2026-05-27: scheduler last chat `status=ok`, TikTok accepted `20` messages, Shopee `status=no_messages`, errors `0`; heartbeat đang chạy và next schedules được ghi trong `E:\shophuyvan-runtime\auto-order-scheduler\status.json`.
- TikTok preview parser local có thể nhận text tóm tắt chưa đủ hướng người gửi; Chat Worker là điểm chuẩn hóa cuối trước khi ghi Core. Production đã sửa `sender_type` cho message preview shop/hệ thống và repair `9` rows cũ; runner vẫn chỉ chạy headful/profile chuẩn.

# Cập nhật 2026-05-26 - Chat Shopee API và shop no-API

- Chat Core production đã tách rõ: Shopee shop có API sync qua SellerChat bridge/polling API; Shopee no-API `khogiadungcona` trả `manual_required/shop_api_not_configured` và chỉ dùng import/helper tay.
- Browser helper không chạy cho Shopee shop có API. Nếu cần xử lý `khogiadungcona`, vẫn dùng profile chuẩn `E:\shophuyvan-python-automation\profiles\browser\HuyVan_Bot_Data_khogiadungcona`, headful/visible theo guard.
- Nút Sync trên UI Chat không còn báo `HTTP 501` cho shop no-API; helper/import tay phải được vận hành qua luồng riêng, không giả lập API sync.

# Cập nhật 2026-05-26 - Secret production cho Chat browser helper

- Worker production đã set `BROWSER_HELPER_SECRET`; local helper đọc cùng secret từ `E:\shophuyvan-python-automation\data\config\browser_helper.local.json` nếu request UI không truyền `automation_token`.
- `features\local_helper\server.py` tự truyền secret này vào biến môi trường `CHAT_AUTOMATION_TOKEN` cho tiến trình chat con; không ghi secret ra command line/log.
- Sau deploy, browser-helper production đã kiểm bằng push có token và WebSocket broadcast; smoke data `codex_*` đã xoá khỏi D1 Chat.

# Cập nhật 2026-05-26 - Chat browser helper endpoint mới

- Chat helper cũ không còn post vào `/api/chat/automation-ingest`; route này đã xoá hẳn khỏi Chat Worker để tránh logic trùng. Hai caller thật `oms_python\features\chat\automation_browser.py` và `automation_ingest.py` đã chuyển sang `/api/chat/browser-helper/push`.
- Token gửi Worker dùng header `X-Helper-Token`, lấy từ `--automation-token` hoặc biến `CHAT_AUTOMATION_TOKEN`. Giá trị production phải khớp secret Worker `BROWSER_HELPER_SECRET` và dài tối thiểu 32 ký tự.
- Skeleton helper mới nằm ngoài repo chính ở `E:\shophuyvan-python-automation\oms_python\features\chat_helper\`: `tiktok_helper.py`, `scraper.py`, `pusher.py`, `config.py`, `config.example.yml`, `requirements.txt`. Helper dùng Playwright async, chạy headful với profile riêng, poll `/api/chat/browser-helper/poll` mỗi 90 giây, scrape DOM theo YAML rồi push về Worker.
- Shop có API không chạy browser helper; Shopee/Lazada API đi webhook/polling Chat Worker. TikTok/manual mới dùng browser helper hoặc import tay.

# Python automation local

## Cập nhật 2026-05-24

- TikTok no-API `0909128999` upload giá KM đã nối e2e qua `oms_python\platforms\tiktok\promotion\upload.py`. Runner mở Chrome visible/headful profile `E:\shophuyvan-python-automation\profiles\browser\shophuyvan-runner-tiktok`, đi đúng Seller Center discount edit, tải mẫu/ID sản phẩm, điền file `Product Discount.xlsx`, upload lại, nhập và đăng.
- Link chương trình TikTok lấy từ payload job hoặc Product Catalog settings `tiktok_promotion_urls`; vận hành đổi link trên Product Master khi TikTok đổi chương trình mỗi 3 tháng, không sửa code runner.
- Job TikTok full-shop `2827` pass thật: `ready_rows=131`, `uploaded=73`, `skipped=58` do `Sku_id bị trùng lặp`, `failed=0`, file upload `E:\shophuyvan-runtime\xlsx\tiktok_discount_upload\tiktok_discount_upload_0909128999_20260524_081138.xlsx`, report `E:\shophuyvan-runtime\xlsx\tiktok_discount_upload\tiktok_discount_upload_0909128999_20260524_081138.json`.
- Runner kiểm ID bằng file `Tiktoksellercenter_batchedit_20260523_all_information_template.zip`; SKU trùng nhiều `product_id/sku_id` bị bỏ qua `ambiguous_tiktok_sku_id`. Sample `40TACKE6X32MMK243` resolve `product_id=1730655569230465831`, `sku_id=1733420946916607783`, giá `50.000đ`, tồn `1`.
- Job chọn một phần từ UI không còn xóa trạng thái upload của toàn shop; `clear_existing` chỉ bật cho job full-shop.
- Shopee no-API `khogiadungcona` upload giá KM đã chạy lại bằng job `2715`, Chrome visible/headful profile `E:\shophuyvan-python-automation\profiles\browser\HuyVan_Bot_Data_khogiadungcona`, `headless=false`.
- Seller Center trả `114/131` và `Chỉ một số sản phẩm thành công`; report tải về `E:\shophuyvan-runtime\downloads\shopee_khogiadungcona_promo_upload_report_20260524_064325.xlsx` parse ra `uploaded=114`, `out_of_stock=17`, `failed=0`.
- `oms_python\platforms\shopee\promotion\shopee_promo.py` đọc file report Shopee sau upload: dòng trống ở cột kết quả là `uploaded`, dòng `Hết hàng` là `out_of_stock`, lỗi khác là `failed`.
- Partial upload chỉ gồm lỗi `Hết hàng` được trả `completed`; nếu có lỗi khác thì vẫn trả `failed`. Không còn báo completed giả khi chưa đọc report.
- Runner post trạng thái từng dòng về Worker `/api/products/promo-upload-results` để Product Master hiển thị badge theo SKU/model: `Đã up sàn`, `Hết hàng`, `Lỗi upload`, `Bỏ qua`.
- Source file selection của runner bỏ qua file sinh ra `_oms_gia_km` và file lọc `_skip_het_hang` để lần upload lại dùng file nguồn Shopee đầy đủ.

## Cập nhật 2026-05-25

- Chat no-API dùng exact target, không chạy filter rộng: Shopee `khogiadungcona` dùng profile `E:\shophuyvan-python-automation\profiles\browser\HuyVan_Bot_Data_khogiadungcona`, TikTok `0909128999` dùng profile `E:\shophuyvan-python-automation\profiles\browser\shophuyvan-runner-tiktok`.
- `oms_python\features\chat\automation_browser.py` bỏ qua mọi shop có API trong `API_SHOP_KEYS` trước khi chọn profile Chrome; shop API phải đi SellerChat/Open Platform hoặc Lazada IM, không dùng Chrome helper.
- Chrome helper Chat kiểm thật đều visible/headful, không headless: Shopee port `9319`, TikTok port `9509`.
- 2026-05-25 production verification: Shopee no-API chạy `ok` và không mở nhầm shop API; TikTok no-API chạy `ok`, ingest 1 tin lần đầu và duplicate-safe khi bấm lại từ UI.

## Cập nhật 2026-05-28 - Flash Sale tự động

- Flash Sale tự động Shopee mới chạy trong Worker API/Core, không tạo Python runner mới trong repo chính.
- Shop API phải đi Open Platform/Worker API trước; không dùng Seller Center fallback cho `chihuy1984`, `chihuy2309`, `phambich2312` khi endpoint Flashdeal chưa được xác minh xong.
- Nếu sau này cần fallback browser cho shop không API, runner phải nằm trong `E:\shophuyvan-python-automation`, Chrome visible/headful và log `headless=false`.

Python automation local đã tách khỏi repo web/worker chính để tránh commit nhầm log, profile Chrome, PDF, XLSX và cache runtime.

## Đường dẫn chuẩn

- Repo chính: `E:\shophuyvan-analytics`
- Python automation: `E:\shophuyvan-python-automation`
- Runtime/log/cache: `E:\shophuyvan-runtime`

## Biến môi trường

- `SHOPHUYVAN_PYTHON_AUTOMATION_DIR`: mặc định `E:\shophuyvan-python-automation`
- `SHOPHUYVAN_RUNTIME_DIR`: mặc định `E:\shophuyvan-runtime`

Các script trong repo chính phải đọc hai biến này trước, không trỏ cứng về `auto OMS Python` trong repo.

## Script vận hành còn giữ trong repo

- `scripts/ensure-oms-radar.ps1`: mở local helper và radar từ thư mục Python automation mới, log vào runtime.
- `scripts/start-telegram-control.ps1`: mở Telegram control bot từ thư mục Python automation mới, log vào runtime.

Không lưu token, cookie, OTP, profile Chrome, PDF, XLSX hoặc cache thật trong repo chính.

## Cập nhật 2026-05-23

- R2 upload: `oms_python/core/utils.py` dùng `SHV_LOCAL_RUNNER_TOKEN` nếu process có sẵn; nếu không có thì xin signed upload URL từ Worker `/api/upload-url`. Đã kiểm thật upload file test lên R2 thành công, không in token ra log.
- TikTok promotion scrape: script chuẩn `E:\shophuyvan-python-automation\oms_python\platforms\tiktok\promotion\tiktok_promo_scrape.py` kết nối Chrome visible qua CDP, đọc cột `Giá ưu đãi` trên trang Seller Center discount edit và ghi `discount_price` về Product/Warehouse Core.
- TikTok profile kiểm tra: `E:\shophuyvan-python-automation\profiles\browser\shophuyvan-runner-tiktok`, CDP port hiện dùng `9509`.
- Promotion job từ OMS dùng `task_type=promotion_prices`, payload `action_type=tai_file|up_gia`, bắt buộc Chrome visible/headful (`headless=false`) và profile automation đúng shop.
- Shopee no-API `khogiadungcona` route qua `E:\shophuyvan-python-automation\oms_python\platforms\shopee\promotion\shopee_promo.py`; sync giá KM từ Seller Center về Core/UI đã pass job `2707`. Các job `2708/2709/2710` từng bị ghi failed khi Seller Center trả `114/131`, nhưng 2026-05-24 đã xác nhận 17 dòng fail đều `Hết hàng`; rule hiện tại cho phép trạng thái `completed` khi không có lỗi khác.
- TikTok no-API `0909128999` hiện đã có scraper giá KM về Core, nhưng upload giá KM lên Seller Center chưa có e2e terminal pass trong Auto-run tab; không ghi completed nếu chỉ tạo file/template hoặc scrape read-only.
- Shopee no-API profile kiểm tra: `E:\shophuyvan-python-automation\profiles\browser\HuyVan_Bot_Data_khogiadungcona`, CDP port hiện dùng `9319`.
- Product sync retry: `oms_python/core/products/product_core_hub.py` retry HTTP `429/500/502/503/504`; job TikTok không còn báo hoàn tất đủ nếu có lô sync lỗi.
## Cập nhật 2026-05-25 - Chat thread detail hotfix

- Nút `Tin mới` trên production Chat/CSKH gọi TikTok helper với `scan_mode=browser_thread_detail`, `browser_width=1380`, `browser_height=860`, `expand_browser_viewport=true` để đọc thread thật thay vì chỉ preview; readback Core có cả `sender_type=customer` và `sender_type=shop`.
- Shopee no-API `khogiadungcona`: CDP trên profile `HuyVan_Bot_Data_khogiadungcona` mở `https://banhang.shopee.vn/new-webchat/conversations` và Shopee trả empty state `Không Tìm Thấy Cuộc Hội Thoại Nào`; helper giữ `status=no_messages`.
### 2026-05-27 - Auto Customer Database

- Radar local có action `customer` qua setting `auto_customer_enabled`.
- Chu kỳ này kéo Lazada bằng Open Platform API, queue TikTok `sync_detail` bằng Chrome visible/headful trong profile automation riêng, rồi gọi `/api/customers/marketplace/rebuild`.
- 2026-05-28: `/api/customers/marketplace/rebuild` chỉ append/merge Customer Core, không xóa contact cũ trước khi quét lại; runner có thể gọi lặp mà không làm mất khách ngoài batch mới.
- Không dùng `E:\codex-chrome-profiles\shophuyvan-test` cho automation. Nếu TikTok profile chưa đăng nhập, job phải dừng ở `runner_requires_login` và mở profile automation cho operator đăng nhập.
# Cập nhật 2026-05-28 - Zalo Chat browser-helper local

- Zalo Chat dùng 2 profile chuẩn trong `E:\shophuyvan-python-automation\profiles\browser`: `Zalo_Shop_Huy_Van_0909128999` CDP `9241` và `Zalo_Nghiem_Chi_Huy_0848881111` CDP `9242`.
- Profile phải chạy visible/headful, không headless. Khi cần đổi tên folder theo tài khoản, đóng đúng PID đang listen trên port CDP rồi mới rename; không rename khi Chrome còn giữ profile.
- Tool local `E:\tool zalo` đọc profile qua `ZALO_ATTACH_PROFILE_ROOT`, `ZALO_ATTACH_PROFILE_NAMES`, `ZALO_ATTACH_PORTS`; `start-zalo-tool.bat` đã set mặc định theo 2 profile trên.
- Auto-send bật mặc định bằng `ZALO_AUTO_SEND_ENABLED=1`, có thể tắt nhanh bằng `ZALO_AUTO_SEND_ENABLED=0`. Guard vẫn bỏ qua group, family/internal, system/stranger, khiếu nại, hoàn tiền, bảo hành, pháp lý, dữ liệu nhạy cảm và tin không phải nhu cầu bán hàng rõ.
- Bridge Chat Core dùng `POST https://shophuyvan-chat-api.zacha030596.workers.dev/api/chat/browser-helper/push`, `channel=zalo`, `connector=zalo_local_browser`, token đọc từ `E:\shophuyvan-python-automation\data\config\browser_helper.local.json`; không ghi secret ra log.
- Kiểm local: `http://127.0.0.1:8794/api/automation/slots` trả 2 slot `ok=true`, `autoSendEnabled=true`, `shophuyvanChatBridge.configured=true`. Sync thật 2 account pass nhưng `autoReplyCount=0` vì chưa có khách đủ điều kiện cần trả lời tại thời điểm kiểm.
- Production API readback: push thật từ Zalo Shop Huy Vân vào Chat Core lưu 3 hội thoại / 26 tin; `shop_id=zalo_shop_huy_van_0909128999`, capability `browser_helper/manual_only`.
- Production UI readback: static `shophuyvan-analytics` version `21793972-66ab-4465-8d1c-209543a70f91`; Chat/CSKH desktop/tablet/mobile thấy hội thoại Zalo trong danh sách chung, không tràn ngang.
- Port local Zalo tool có fallback: `server.js` và `start-zalo-tool.bat` thử port kế tiếp khi port yêu cầu đang bận. Kiểm thật `8794` bận -> server mới chạy `8795`; batch `--print` chọn `8788` khi `8787` bận.
- Cài đặt quét tự động nằm trong dialog Cài đặt AI của Zalo tool: `automation.scanIntervalSeconds`, mặc định 30 giây, giới hạn 15-3600 giây; server đọc setting động giữa các vòng background sync.
- Cửa sổ Zalo mở gọn ở góc trên theo setting: mặc định `520x760`, slot 1 tại `0,0`, slot 2 tại `540,0`. Launcher ưu tiên Chrome trước Edge để giữ đúng session profile Chrome.
- AI auto-reply Zalo đang bật điều kiện kỹ thuật: `aiRuntimeReady=true`, account `aiEnabled=true`, `ZALO_AUTO_SEND_ENABLED=1`; guard vẫn chặn group/family/system/stranger/risk-sensitive trước khi gửi.
# Cập nhật 2026-05-28 - Zalo scan setting và sync lịch sử

- Kiểm trực tiếp Zalo Web bằng CDP 9241/9242: slot 1 `Shop Huy Vân` thấy hội thoại `Kỹ Thuật Hoàng Nhân`, 2 tin shop `dạ` và `khách đấu được chưa ạ`, giờ Zalo `20:40`; slot 2 `Nghiem Chi Huy` thấy hội thoại `严千欣（nta)`, tin inbound `bá oi kêu má lát 4h30 chở zín nha bá`, ngày `T6 22/05/2026`, giờ `16:11`.
- `zaloAutomation.syncMessages()` hiện đọc thêm `.chat-date` và tự kế thừa giờ cho bubble cùng nhóm bị Zalo ẩn giờ; `shophuyvanChatBridge` chuyển giờ Zalo local UTC+7 sang ISO trước khi push Chat Core.
- Background automation hiện sync các hội thoại Zalo gần nhất mỗi vòng, không chỉ sync hội thoại có điều kiện auto-reply. Kiểm thật sau 90 giây thấy slot 1 và slot 2 tự cập nhật `lastAutomationSyncAt`.
- Cảnh báo dữ liệu: Zalo Web slot 1 đang báo `Zalo Web của bạn hiện chưa có đầy đủ tin nhắn gần đây`; muốn kéo lịch sử sâu hơn giới hạn Web hiện tại phải bấm đồng bộ trên Zalo Web hoặc dùng Zalo PC.
- Zalo local helper `E:\tool zalo` đang chạy ở `http://127.0.0.1:8794` với PID `23560`; nếu `8794` bận, server có cơ chế thử port kế tiếp theo `PORT_FALLBACK_ATTEMPTS`.
- `GET /api/automation/slots` trả 2 profile Zalo trong `E:\shophuyvan-python-automation\profiles\browser` đều `ok=true`, `scanIntervalSeconds=30`, `windowWidth=520`, `windowHeight=760`, `autoSendEnabled=true`, `aiRuntimeReady=true`.
- Settings Chat/AI tab `Kênh chat` có slider `Quét Zalo tự động` lưu qua `PATCH /api/settings` với `automationScanIntervalSeconds`.
- Đồng bộ lịch sử Zalo dùng `POST /api/shophuyvan-chat/sync-history`; route này chỉ sync/push Chat Core, đặt `allowAutoReply=false` để backfill lịch sử không tự trả lời.
- Kiểm thật hội thoại `Kỹ Thuật Hoàng Nhân / 8195779656939267821`: sync 2 tin, push Chat Core ok; lần sync lặp sau fix khóa stable trả `saved_messages=0`, `skipped_duplicates=2`.
- Test gửi nội dung `ok` đã chạy qua `POST /api/shophuyvan-chat/send`, nhưng Zalo Web trả `zalo_requires_friend` vì hội thoại là người lạ/chưa kết bạn. Automation không được ép gửi khi Zalo chặn chính sách hội thoại.
## Cap nhat 2026-05-30 - compact window + one-tab-per-feature for TikTok/Shopee no-API

- Da sua runtime de tranh mo tab moi lien tuc tren cung tinh nang:
  - `E:\shophuyvan-python-automation\oms_python\features\reports\run_report_jobs.py`
  - `E:\shophuyvan-python-automation\oms_python\features\chat\automation_browser.py`
- Rule moi:
  - Task tab key theo `platform:shop:action_type`.
  - Neu da co tab dung key thi tai su dung.
  - Neu trung key nhieu tab thi tu dong dong tab du.
- Khung trinh duyet cho TikTok `0909128999` va Shopee no-API `khogiadungcona` duoc ep gon va nam tren cung man hinh:
  - chat sync auto gui runtime `browser_width=620`, `browser_height=480`, `browser_top=0`.
  - report runner co compact override cho 2 profile no-API de tranh che man hinh van hanh.
- Trang thai verify local:
  - `python -m py_compile` pass cho 3 file da sua.
  - chat-sync TikTok readback `window_bounds=620x480`, `viewport.reason=compact_mode_locked`.
  - chat-sync Shopee no-API readback `window_bounds=620x480`.
  - tab count CDP on 2 profiles giu on dinh sau khi chay lap: TikTok `2->2`, Shopee `2->2`.
  - Chua chay production deploy trong luot nay.

# Cap nhat 2026-05-31 - Zalo helper chong lap noi dung

- Da kiem truc tiep Zalo Web that qua CDP `9241/9242`, khong ket luan chi tu log helper.
- `E:\tool zalo\server.js` reconcile alias local theo snapshot DOM hien tai va giu khoa `direction + text + visible minute + attachments`; nhan ngay tuong doi duoc canonical hoa truoc khi luu.
- `E:\tool zalo\src\services\shophuyvanChatBridge.js` compact payload truoc khi push, uu tien dong co ngay explicit va bo fallback theo vi tri DOM `pos_<index>`.
- Helper dang chay `http://127.0.0.1:8794`, PID `49548`, bridge configured; hai Chrome profile Zalo van visible/headful.
- `E:\tool zalo\server.js` serialize background scan, sync-history va send theo tung `account_id`; `zaloAutomation.syncMessages()` abort neu Zalo Web chua mo dung conversation id/title. Rule nay chan noi dung thread khac bi day nham khi scheduler va nut Sync chay cung luc.
- Readback that:
  - `Ky Thuat Hoang Nhan`: local `4 -> 2`, sync lap `saved_messages=0`, `skipped_duplicates=2`.
  - `Cau Hoang`: local `37 -> 15`, sync lap `saved_messages=0`, `skipped_duplicates=15`.
  - Race test `Cau Hoang`: 2 request sync-history dong thoi deu `messages_synced=15`, `saved_messages=0`, `skipped_duplicates=15`.
- Da snapshot runtime va xoa dung `2` D1 row nhiem cheo thread phat sinh truoc race-lock; SQL readback `remaining=0`. Khong cleanup rong legacy alias.

# Cap nhat 2026-05-31 - Zalo helper Local Network Access va bounded cleanup

- Xac nhan truc tiep 2 profile Chrome Zalo visible/headful dang dung dung folder:
  - `E:\shophuyvan-python-automation\profiles\browser\Zalo_Shop_Huy_Van_0909128999`, CDP `9241`.
  - `E:\shophuyvan-python-automation\profiles\browser\Zalo_Nghiem_Chi_Huy_0848881111`, CDP `9242`.
- Helper `E:\tool zalo` dang listen `http://127.0.0.1:8794`, PID `28460`; scheduler `scanIntervalSeconds=30`, 2 slot `ok=true`, `autoSendEnabled=true`, `aiRuntimeReady=true`.
- `E:\tool zalo\server.js` tra header cho Local Network Access va log preflight an toan, khong log noi dung tin nhan/token.
- Trang Chat production goi helper local bang `targetAddressSpace: 'local'`. Chrome 142+ van can operator bam `Cho phep` mot lan cho domain production khi hien hop xin quyen mang local.
- Direct route readback sau restart:
  - `POST /api/shophuyvan-chat/sync-history` cho `Dang Kim Dung / 1025381407093463190`.
  - `messages_synced=2`, `saved_messages=0`, `skipped_duplicates=2`.
- Bounded cleanup da xoa dung `6` message alias cu va `1` conversation alias rong cua thread tren. Khong cleanup rong alias Zalo khac trong luot nay.

# Cap nhat 2026-05-31 12:47 - Zalo Cậu Hoàng source cleanup verified

- `E:\tool zalo\src\services\shophuyvanChatBridge.js` chi push message khi co ca ngay hien thi explicit va gio hien thi; row `date_unknown`, `time_unknown`, `_pos_` khong con duoc day len Chat Core.
- `E:\tool zalo\src\services\zaloAutomation.js` kiem tra active conversation id truoc khi sync va truoc khi send, chan scheduler hoac tab switch lam lay nham noi dung hoi thoai khac.
- Helper hien tai: `http://127.0.0.1:8794`, PID `22828`, `scanIntervalSeconds=30`, `autoSendEnabled=true`, `aiRuntimeReady=true`, 2 slot CDP `9241/9242` deu connected.
- Kiem truc tiep profile `Zalo_Nghiem_Chi_Huy_0848881111` CDP `9242`: thread `Cậu Hoàng` tren Zalo Web khong co `STORE DETAILING`; DOM tail khop noi dung that cua hoi thoai.
- Local store backup `E:\shophuyvan-runtime\zalo-tool\store-before-cau-hoang-clean-20260531T053642Z.json`; da xoa dung `2` row `STORE DETAILING` sai trong key `acc_d290997981634d3ea3f2f24b6f3ef3b3:3714274722232243239`.
- Exact sync `Cậu Hoàng / 3714274722232243239`: `messages_synced=15`, `saved_messages=0`, `chat_core_push.saved_messages=0`, `skipped_duplicates=15`.
- Production readback sau mot chu ky scheduler 30 giay: `count=15`, `badHits=0` voi `date_unknown|time_unknown|_pos_|STORE DETAILING|0908094790`.
- Zalo van la social/browser-helper fallback, khong gan nhan official API. Auto-send van bat, nhung helper phai xac nhan dung hoi thoai truoc khi type/send.

# Cap nhat 2026-05-31 13:55 - Zalo local helper origin hardening

- Helper `E:\tool zalo` da doi CORS tu `Access-Control-Allow-Origin: *` sang allowlist origin trong `src\services\localHelperSecurity.js`.
- Origin duoc phep: ShopHuyVan production, `shophuyvan-analytics.pages.dev`, va loopback (`127.0.0.1`, `localhost`).
- Origin la bi chan truoc route voi `403 origin_not_allowed`; preflight origin la khong duoc tra `Access-Control-Allow-Private-Network`.
- JSON body mac dinh bi gioi han `256KB`; request qua lon tra `413 body_too_large`.
- Helper bind mac dinh `127.0.0.1`; muon LAN phai set ro `ZALO_HELPER_ALLOW_LAN=1` hoac `ZALO_HELPER_HOST`.
- Sau restart: PID `20284`, listen `127.0.0.1:8794`, 2 profile CDP `9241/9242` ok, scheduler pass, production `Cau Hoang` van `count=15`, `badHits=0`.

# Cap nhat 2026-05-31 19:50 - Non-API order/status queue recovery (TikTok + Shopee)

- Runtime live check: GET http://127.0.0.1:8765/health cho thay radar/report-worker dang chay, scheduler enabled.
- Readback production: GET /api/orders?platform=tiktok&shop=0909128999 va GET /api/orders?platform=shopee&shop=khogiadungcona deu co source_updated_at moi (TikTok ~18:28, Shopee ~19:25).
- Da xu ly job lock-busy theo dung route jobs:
  - GET /api/jobs?mode=monitor
  - PATCH /api/jobs/{id} -> status=queued cho 7634,7639,7662,7663,7664,7665,7666,7669.
- Da verify requeue thanh cong:
  - Job 7634 (shopee_seller_detail) chay lai completed, updated=3, core_readback_ok=true.
- Runtime fix:
  - E:\shophuyvan-python-automation\oms_python\platforms\shopee\orders\parser_chitiet.py: bat exception page.bring_to_front() de tranh fail ca job vi tab-focus bug.
- Con mo:
  - Cac job requeue Shopee con lai dang queued (worker dang xu ly FIFO, co batch TikTok finance phia truoc).

# Cap nhat 2026-06-01 - Zalo helper/profile autostart va tat auto-send

- Nguyen nhan Zalo khong hien de chay: sau restart khong co autostart rieng cho ShopHuyVan Zalo helper/profiles; Windows Startup chi co `Zalo.lnk` thuong, Scheduled Task khong co muc `Zalo|ShopHuyVan|shophuyvan|Chat`.
- Da them launcher tong: `E:\tool zalo\start-zalo-all.ps1`.
- Launcher bat 2 Chrome profile visible/headful neu CDP port chua listen:
  - `9241` -> `E:\shophuyvan-python-automation\profiles\browser\Zalo_Shop_Huy_Van_0909128999`.
  - `9242` -> `E:\shophuyvan-python-automation\profiles\browser\Zalo_Nghiem_Chi_Huy_0848881111`.
- Launcher bat local helper neu port `8794` chua listen, voi `ZALO_ATTACH_PORTS=9241,9242`, `ZALO_AUTO_SEND_ENABLED=0`, bridge config tai `E:\shophuyvan-python-automation\data\config\browser_helper.local.json`.
- Launcher health-check cac port helper `8794..8814`; neu `8794` bi chiem boi dich vu khac hoac helper da fallback sang port ke tiep, script khong ket luan sai chi dua tren listener thuan.
- Khi can start moi helper, script set `PORT=8794` va `PORT_FALLBACK_ATTEMPTS=20` de `server.js` tu xoay cong neu `8794` ban.
- Da tao Windows Startup shortcut:
  - `C:\Users\Admin\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup\ShopHuyVan Zalo Helper.lnk`.
  - Target: `powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "E:\tool zalo\start-zalo-all.ps1"`.
- Kiem tra sau khi chay:
  - `8794`, `9241`, `9242` deu listen.
  - `/api/automation/slots` tra 2 slot `ok=true`, scheduler `running=true`, `autoSendEnabled=false`, `aiRuntimeReady=true`, `lastError=""`.
- Sau khi phat hien auto-reply sai hoi thoai `COOP FOOD`, da tat AI cho 2 account live:
  - `Shop Huy Vân`: `ai.enabled=false`.
  - `Nghiem Chi Huy`: `ai.enabled=false`.
- Da tat rule tu dong chao: `autoWelcomeOnNewFriend=false`, `autoGreetOnFirstInbound=false`.
- Cau tra loi sai lay tu local Zalo knowledge base:
  - `E:\tool zalo\data\training\shophuyvan-products.md/json`.
  - `E:\tool zalo\data\store.json`, product `shv-prd-1935` (`Băng Keo Hai Mặt... K112`).
- Khong bat lai auto-send Zalo neu chua lam sach kho noi dung va them buoc duyet/cancel tren UI.
- Cach bat thu cong khi can:
  - Bat ca cum: chay `powershell -NoProfile -ExecutionPolicy Bypass -File "E:\tool zalo\start-zalo-all.ps1"`.
  - Bat rieng profile 1: `E:\tool zalo\start-zalo-browser.bat 1`.
  - Bat rieng profile 2: `E:\tool zalo\start-zalo-browser.bat 2`.
  - Bat rieng helper: `E:\tool zalo\start-zalo-tool.bat 8794`.

# Cap nhat 2026-06-02 - Zalo send bridge va thu tu tin cung phut

- FE Chat/CSKH khong con gui `targetAddressSpace: 'local'` khi goi Zalo helper, vi Chrome production da chan `POST /api/shophuyvan-chat/send` voi `InvalidLocalNetworkAccess`. Helper van tra CORS/PNA allowlist va UI van xoay port `8794..8799`.
- `E:\tool zalo\src\services\zaloAutomation.js` khong chan hoi thoai chi vi co banner `NGUOI LA`/`Gui ket ban` neu Zalo Web van co composer `#richInput` editable. Chi chan khi co hard cannot-send signal hoac khong co composer gui duoc.
- `E:\tool zalo\src\services\shophuyvanChatBridge.js` them offset mili-giay theo DOM order cho cac tin cung phut truoc khi push Chat Core, de UI khong sap xep dao nguoc theo id ngau nhien.
- Test gui that qua production UI:
  - Hoi thoai `Thanh / 2372356367431295040`, profile `Zalo_Nghiem_Chi_Huy_0848881111` CDP `9242`.
  - Click nut `Gui` tren `/pages/chat-cskh` voi noi dung `ok`.
  - Zalo Web hien outgoing `ok` luc `17:55`, trang thai `Da nhan`.
  - Chat Core doc lai co shop `ok`, `status=synced`, `created_at=2026-06-02T10:55:00.019Z`, `platform_message_id=zalo_local_2372356367431295040_out_02/06/2026_17:55_2cyo`.
- Test thu tu:
  - Hoi thoai `Suleo Vina / 6975238965683388769` cac tin `11:52` hien theo dung DOM order voi `created_at` `.043Z` den `.048Z`.
- Runtime hien tai:
  - Helper `http://127.0.0.1:8794`, PID `27096`.
  - 2 profile Zalo visible/headful CDP `9241/9242` connected.
  - Scheduler running, `scanIntervalSeconds=30`.
  - `autoSendEnabled=false`, `localAiReplyEnabled=false`; khong bat lai AI tu dong trong luot nay.
