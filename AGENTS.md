# Hướng Dẫn Cho Codex / Agent

## Nguyên tắc bắt buộc

- Sau khi chỉnh sửa phải mở hoặc chạy luồng thực tế đến khi xác nhận thành công rồi mới báo lại. Không chỉ viết code rồi kết luận.
- Sau khi chỉnh sửa code phải deploy đúng phần bị ảnh hưởng rồi kiểm tra lại trên môi trường đang chạy thật. Không báo ổn định nếu mới test local, chưa deploy hoặc chưa thao tác thực tế luồng người dùng gặp lỗi.
- Giao diện website ưu tiên mobile first, tiếng Việt có dấu, nội dung ngắn gọn để đội vận hành dùng trực tiếp.
- Mỗi page có nhiều tính năng con phải tách thành tab con hoặc page con rõ ràng để dễ kiểm tra và vận hành. Không dồn thành một page kéo dài quá mức khiến khó theo dõi, khó bấm và khó kiểm tra trên mobile.
- Code mới hoặc đoạn logic khó hiểu phải có comment tiếng Việt có dấu, giải thích lý do nghiệp vụ, không comment kiểu mô tả dòng lệnh hiển nhiên.
- Không đảo hoặc xóa thay đổi có sẵn nếu không chắc đó là phần mình tạo ra. Worktree thường có nhiều thay đổi song song.
- Khi thiếu endpoint Open Platform, phải báo đúng tên endpoint cần tìm. Không giả lập thao tác nguy hiểm như tắt/bật ADS nếu API chưa có endpoint chính thức.
- Khi cần tra tài liệu Shopee Open Platform, dùng skill `shopee-open-platform-docs` và Chrome profile riêng ở `%LOCALAPPDATA%\ShopHuyVan\ChromeProfiles\ShopeeOpenPlatform`. Người dùng đăng nhập thủ công; không lưu mật khẩu, OTP, cookie hoặc token vào repo/skill.

## Cách tư vấn và chốt hướng cho tính năng mới

- Với tính năng mới hoặc phần sửa ảnh hưởng rộng, trước khi làm lớn phải đưa ra nhiều phương án xử lý, nêu ưu/nhược điểm, số request dự kiến, độ chính xác dữ liệu, rủi ro vận hành và tác động maintain. Không tự chắp vá mỗi nơi một ít khi chưa rõ hướng core.
- Với phần ảnh hưởng rộng tới cách vận hành như tài chính, chat, AI auto-reply, automation hoặc kiến trúc page, phải hỏi/chốt lại hướng với người dùng trước khi đi sâu. Không tự chọn một hướng nửa vời rồi mới báo sau.
- Luôn ưu tiên phương án có core dữ liệu dùng chung: một nơi chuẩn hóa, một nơi đồng bộ, nhiều màn hình chỉ đọc lại. Nếu Dashboard, ADS, chat, order analytics, cron hoặc Python cùng dùng một logic thì phải tách core trước.
- Mỗi tính năng mới phải được đánh giá đồng loạt cho cả 3 sàn `Shopee`, `Lazada`, `TikTok`. Nếu chưa thể làm đủ 3 sàn trong cùng một đợt thì phải ghi rõ sàn nào đã làm xong, sàn nào chỉ mới có core, sàn nào còn thiếu endpoint hoặc thiếu quyền.
- Bắt buộc tách luồng ngay từ đầu giữa `shop có API` và `shop không có API`. UI, backend, cron và helper local không được dùng chung một luồng mơ hồ rồi đoán shop nào chạy API. Mọi màn hình phải hiện rõ shop đang ở chế độ nào.
- Với shop không có API, luôn phải đưa ra phương án vận hành riêng bằng tiếng Việt có dấu, ví dụ: chỉ dùng dữ liệu tham chiếu, nhập file, browser hỗ trợ có kiểm soát, hoặc thao tác tay có log. Không được gắn nhãn “đồng bộ API” cho shop chưa có API.
- Mọi phần hướng dẫn sử dụng, ghi chú vận hành, cảnh báo và nhãn trạng thái trên web phải viết bằng tiếng Việt có dấu, ngắn gọn, nói rõ tính năng dùng để làm gì và khi nào nên dùng.
- Không được dừng ở mức “đã có API/đã có nút sync”. Mỗi tính năng đã làm ra phải có phương án vận hành trực quan trên web, trạng thái đang chạy thế nào, log/lần chạy cuối và hướng tự động hóa hoặc tối ưu hóa tiếp theo nếu tính năng đó phù hợp để tự động.
- Sau mỗi lần xử lý xong một cụm tính năng, phải có thông báo tổng kết rõ “đã làm được những gì”, “đang khóa những gì”, “shop có API chạy theo cách nào”, “shop không có API xử lý theo cách nào”, để người dùng nhìn là biết ngay phạm vi đã hoàn tất.
- Mỗi tính năng vận hành phải có ghi chú tiếng Việt trong UI: tính năng dùng để làm gì, dùng khi nào, dữ liệu lấy từ endpoint/bảng nào, giới hạn API là gì, trường hợp nào cần bấm đồng bộ lại.
- Với phân tích tài chính, lãi ròng, đối soát Shopee Payment, báo cáo thuế và dòng tiền, phải đề xuất hướng tích hợp thông minh: lấy dữ liệu thật từ API sàn trước, lưu snapshot D1, chạy batch theo ngày/tháng, chỉ gọi bổ sung phần thiếu, và ghi rõ nguồn dữ liệu để người dùng kiểm tra được.
- Nếu shop có API tài chính/phí sàn chính thức thì phải dùng dữ liệu API đó làm nguồn chuẩn để tính toán trước. `cost setting` chỉ được dùng làm fallback tham chiếu cho shop không có API hoặc cho phần dữ liệu API còn thiếu, và UI phải ghi rõ đây là fallback chứ không phải số phí sàn chuẩn.
- Với tự động hóa, phải mô tả quy trình an toàn: điều kiện kích hoạt, dữ liệu đầu vào, bước kiểm tra trước khi gửi lệnh thật, log kết quả, cách rollback hoặc dừng nếu API trả lỗi.
- Nếu endpoint hiện có chưa đủ cho phân tích chính xác, phải ghi rõ trong UI và báo người dùng đúng tên endpoint/chức năng cần tìm trong Open Platform. Không thay thế bằng dữ liệu fallback nếu fallback có thể làm sai báo cáo tài chính hoặc thuế.

## Bản đồ hệ thống

- `apps/fe`: frontend tĩnh chạy trên Pages/static server. Các page chính nằm ở `apps/fe/pages`, logic chia theo `apps/fe/js/dashboard`, `apps/fe/js/modules`, `apps/fe/js/admin`.
- `apps/worker-api`: Cloudflare Worker API, D1, R2 và cron. Route nằm ở `apps/worker-api/src/routes`, helper DB ở `apps/worker-api/src/utils`, core backend đặt ở `apps/worker-api/src/core`.
- `scripts`: chỉ giữ script kiểm thử CDP, PowerShell mở profile hoặc công cụ không phải Python. Không tạo thêm Python mới trong thư mục này nếu tính năng thuộc OMS vận hành.
- Python local automation đã tách khỏi repo chính, đặt tại `E:\shophuyvan-python-automation`. Code thật nằm trong package `E:\shophuyvan-python-automation\oms_python`, chia theo `core`, `platforms/<sàn>/<tính năng>`, `features/<tính năng chung>` và `ui`.
- Chrome profile automation của OMS đặt trong `E:\shophuyvan-python-automation\profiles\browser`. Không tạo hoặc trỏ profile automation ra Desktop vì sẽ làm rác màn hình và dễ nhầm với file cá nhân.
- Root repo có cache/log/tạm như `cache_orders_*.json`, `bot-*.log`, `tmp-*`, `.codex-chrome-profile*`. Đây không phải source of truth, chỉ dùng kiểm tra hoặc debug.

## Hướng core đã chốt

### 1. Trạng thái đơn hàng

- Source of truth backend: `apps/worker-api/src/core/order-status-core.js`.
- Frontend mirror đang dùng: `apps/fe/js/dashboard/order-status-core.js`.
- Dashboard, ADS, order analytics, chat, OMS, returns và cron phải dùng core này để chuẩn hóa `CANCELLED`, `RETURN`, `TO_RETURN`, `FAILED_DELIVERY`, `LOGISTICS_*`.
- Không tự viết lại regex phân loại hủy/hoàn ở từng route/page. Nếu thiếu trạng thái mới, thêm vào core trước rồi import dùng lại.

### 2. Kích thước Chrome automation

- Source of truth Python: `E:\shophuyvan-python-automation\oms_python\core\browser_runtime\settings.py`.
- Web gửi `runtime_settings`, helper local truyền vào env, mọi script mở Chrome phải đọc qua core này.
- Không hardcode `--window-size`, `--window-position`, minimize hoặc expand viewport trong từng script riêng lẻ.
- Các tác vụ mở Chrome như chat, radar, tải report, TikTok check, Shopee/Lazada helper đều phải dùng chung bộ khóa:
  `browser_width`, `browser_height`, `browser_left`, `browser_top`, `browser_minimized`, `expand_browser_viewport`.

### 3. ADS

- ADS là page riêng: `apps/fe/pages/ads.html` và `apps/fe/js/dashboard/ads.js`. Dashboard chính chỉ điều hướng sang ADS, không giữ logic tắt/bật ADS cũ.
- Core ADS cần gom chung các phần: khoảng ngày/tháng, shop filter, campaign snapshot, metric `spend`, `sales`, `click`, `CPC`, `ROAS`, `ACOS`, ROI và trạng thái campaign.
- Tắt/bật campaign chỉ được làm khi có endpoint chính thức từ Open Platform. Nếu chưa có, UI phải báo thiếu endpoint cụ thể thay vì cho người dùng tưởng đã tắt/bật.
- Đồng bộ ADS các tháng trước phải chạy theo batch/cửa sổ thời gian, lưu snapshot rồi phân tích từ D1 để giảm request.

### 4. Discount và giá theo tồn kho

- Logic giá khuyến mại phải tách thành core riêng, không để trong modal UI.
- Hướng đã chốt: cấu hình theo ngưỡng tồn kho, ví dụ tồn dưới 10, tồn dưới 100, tồn từ 100 trở lên thì đề xuất/áp giá tương ứng.
- Không bắt người dùng nhập câu xác nhận dài để áp dụng. Thay bằng quyền admin, preview payload rõ ràng, nút áp dụng thật và log kết quả.

### 5. Chat sàn

- Chat page riêng: `apps/fe/pages/chat-marketplace.html`; frontend chat dùng loader `apps/fe/js/dashboard/fe-chat-marketplace-loader.js` và các module `apps/fe/js/dashboard/fe-chat-marketplace/fe-chat-*`.
- Backend chat dùng wrapper `apps/worker-api/src/routes/worker-chat-marketplace-route.js` và các module `apps/worker-api/src/routes/worker-chat-marketplace/worker-chat-*`.
- Không tạo lại tên chung như `chat.js`, `part-01.js` hoặc tên file trùng giữa frontend/backend. File chat mới phải đặt theo tính năng, có prefix `fe-chat-` hoặc `worker-chat-`, và phải dưới `30KB`.
- Local helper mở Chrome qua `E:\shophuyvan-python-automation\oms_python\features\local_helper\server.py`; automation đọc/sync/gửi qua `E:\shophuyvan-python-automation\oms_python\features\chat\automation_browser.py`.
- Chat là luồng vận hành chính, không được chấp nhận trạng thái “vào là loading mãi, lâu lâu mới lên”. Nếu gặp lỗi này phải điều tra đến tận gốc: tắc ở API/token, browser helper, policy quét, DB, hay render frontend; báo rõ nguyên nhân và hướng xử lý dứt điểm trước khi mở rộng tính năng mới.
- Tin nhắn TikTok/Shopee/Lazada phải qua core lọc nhiễu trước khi lưu hoặc hiển thị. Không để text UI như bộ lọc, tab, card đơn hàng bị nhập thành nội dung chat.
- Khi liên kết đơn hàng trong chat, trạng thái hiển thị phải dùng `order_status_core`, không hiển thị raw `RETURN`, `CANCELLED` nếu đã có nhãn tiếng Việt.
- Hướng chat đã chốt: dùng `chat_transport_core` để quyết định shop đi `api_chat_worker` hay `browser_chat_worker`; shop có API/token sống thì không tự mở Chrome, shop `browser_required` hoặc `api_unavailable` mới dùng Chrome.
- Định danh hội thoại phải qua `chat_identity_core`; UI luôn ưu tiên `canonical_conversation_id`, còn id phụ từ automation/browser cũ lưu vào bảng `chat_conversation_aliases`. Không xóa dữ liệu gốc khi gộp, chỉ map alias về hội thoại chính.
- Quét Chrome theo 2 tầng qua `chat_scan_policy_core`: tầng 1 chỉ quét ngoài danh sách để biết hội thoại mới/có thay đổi; tầng 2 chỉ mở sâu khi khách mới, nghi trùng, preview đổi, hoặc thiếu `buyer_id/thread_url`. Mục tiêu là ít request, ít Chrome và không gộp bừa.
- AI trong chat không được dừng ở kiểu “bấm gợi ý AI rồi người dùng phải bấm enter”. Nếu đã làm AI trả lời thì phải có phương án auto-reply thật với rule, guard an toàn, điều kiện kích hoạt, log và công tắc bật/tắt theo shop. Chế độ gợi ý tay chỉ là fallback, không phải đích cuối.
- Khi rà tài liệu chat, phải ghi riêng bảng `API shop làm được gì` và `shop không API chưa làm được gì`. Đây là đầu vào bắt buộc cho lộ trình tự động hóa sau này.
- Lazada có bộ IM API chính thức trong docs (`/im/session/list`, `/im/session/get`, `/im/message/list`, `/im/message/send`, `/im/session/open`, `/im/session/read`, `/im/message/recall`). Với shop Lazada có API và app có quyền IM, phải ưu tiên luồng API trước Chrome.
- Tài liệu Yuque `Lazada IM Open API` nhấn mạnh ISV nên dùng long-polling để đẩy tin gần realtime cho seller. Khi build lại chat Lazada, ưu tiên session/message polling từ API và chỉ fallback browser khi token/quyền lỗi.
- Shopee hiện có code sellerchat/webchat trong repo, nhưng bộ docs public đã quét chưa đủ endpoint buyer-seller chat tương ứng. Vì vậy mọi tính năng chat Shopee đi API phải giữ guard/log rõ ràng và ghi chú nếu đang dựa vào endpoint chưa có tài liệu public đầy đủ.
- Nếu người dùng có thêm tài liệu Shopee chat chính thức, phải yêu cầu đúng tên endpoint còn thiếu rồi cập nhật vào reference `chat-endpoints.md` trước khi mở rộng tính năng.
- Sau mỗi đợt sửa chat, báo lại rõ 4 nhóm:
  1. Shop API đã làm được gì bằng API chính thức.
  2. Shop API còn đang thiếu quyền gì.
  3. Shop không API đang fallback bằng cách nào.
  4. Tính năng nào mới chỉ lưu OMS/chờ xác nhận gửi lên sàn.

### 6. Shop, platform và nguồn dữ liệu

- Mọi dữ liệu nên khóa theo cặp `platform + shop_name` hoặc `platform + shop_id` nếu có. Không chỉ dựa vào tên hiển thị.
- Cấu hình profile local hiện ở `E:\shophuyvan-python-automation\data\shops.json`; API/shop config nằm trong D1 qua routes `shops`, `api-sync`, `api-modules`.
- Khi thêm core shop sau này, cần gom mapping platform, shop, profile_dir, API capability và quyền sync vào một nơi rồi các route/page dùng lại.

### 7. Khoảng ngày/tháng và request policy

- Nên tách `date_range_core` dùng chung cho Dashboard, ADS, Order analytics và cron. Tất cả mặc định theo timezone vận hành Việt Nam.
- Request phải ưu tiên ít nhưng đủ dữ liệu: batch theo shop/tháng, incremental cursor, snapshot D1, không gọi N+1 theo từng dòng nếu có thể gom.
- UI chỉ phân tích từ dữ liệu đã lưu khi có thể; API sàn chỉ dùng để đồng bộ hoặc làm giàu phần còn thiếu.

## Cấu trúc Python local

- Python local đã được gom vào `E:\shophuyvan-python-automation\oms_python` và nằm ngoài repo chính.
- Khi thêm Python mới phải đặt theo đúng mục đích:
  - `oms_python/core`: cấu hình, runtime Chrome, logging, helper dùng chung.
  - `oms_python/platforms/shopee/<tính năng>`: Shopee auth, orders, products, finance, promotion, video, chat.
  - `oms_python/platforms/lazada/<tính năng>`: Lazada auth, orders, products, finance, chat.
  - `oms_python/platforms/tiktok/<tính năng>`: TikTok auth, orders, products, finance, chat.
  - `oms_python/features/<tính năng>`: tính năng chung như local helper, radar, report, CCTV, video repost, mua hàng.
  - `oms_python/ui`: UI desktop cũ và các tab.
- Không tạo lại các thư mục Python cũ `engines`, `parsers`, `ui` trong repo chính; các tên này đã được xóa sau refactor.
- File entrypoint còn được phép ở root `E:\shophuyvan-python-automation` chỉ nên là launcher mỏng như `main.py`. Code nghiệp vụ phải nằm trong `oms_python`.
- File sinh ra như `__pycache__`, log, cache, profile Chrome, `tmp-*` không được xem là source. Nếu cần dọn, list rõ tên file trước khi xóa.

## Quy trình sửa chuẩn

## Profile kiểm thử production

- Profile Chrome riêng cho kiểm thử web production:
  `%LOCALAPPDATA%\ShopHuyVan\ChromeProfiles\ProductionAdminTest`
- URL production cần mở khi kiểm UI:
  `https://shophuyvan-analytics.nghiemchihuy.workers.dev/pages/profit-dashboard.html`
- Tài khoản kiểm thử nên là admin/test-admin riêng cho vận hành. Agent chỉ được ghi nhớ vai trò hoặc tên gợi nhớ tài khoản nếu người dùng cung cấp, không lưu mật khẩu, OTP, cookie, token hoặc session vào repo/skill/memory.
- Khi cần kiểm UI thật, mở Chrome bằng profile trên, để người dùng đăng nhập thủ công nếu profile chưa có phiên đăng nhập. Sau đó mới bấm các nút thật trong Dashboard.
- Không dùng chung profile này với profile tài liệu Shopee Open Platform. Profile Shopee docs vẫn là `%LOCALAPPDATA%\ShopHuyVan\ChromeProfiles\ShopeeOpenPlatform`.

1. Đọc core hiện có trước khi sửa route/page.
2. Nếu logic dùng ở từ hai nơi trở lên, đưa vào core trước.
3. Frontend chỉ giữ phần hiển thị và gọi API; backend/core giữ nghiệp vụ và chuẩn hóa dữ liệu.
4. Python helper chỉ điều phối local/browser; không tự quyết định nghiệp vụ nếu backend đã có core.
5. Sau khi sửa phải chạy kiểm tra phù hợp: `node --check`, `python -m py_compile`, API/helper thực tế, hoặc mở page trong browser tùy phần đã đụng.
6. Deploy đúng môi trường liên quan trước khi kết luận: frontend thì deploy Pages/static, worker thì deploy Worker API, helper Python thì restart helper/local service nếu code chạy qua service.
7. Sau deploy phải kiểm tra lại luồng thực tế mà người dùng báo lỗi: mở web thật, bấm nút thật, chạy sync/warm/send thật ở mức an toàn, xem dữ liệu thật đã ổn định chưa.
8. Báo lại rõ đã sửa gì, đã deploy phần nào, đã kiểm tra thực tế gì, kết quả gì, phần nào chưa kiểm được và lý do.

## Quy tắc dữ liệu bẩn

- Nếu phát hiện dữ liệu bẩn, dữ liệu cũ lệch chuẩn, dữ liệu trùng hoặc dữ liệu đang làm sai kết quả thì phải ưu tiên làm sạch, chuẩn hóa hoặc gắn cờ xử lý dứt điểm trước rồi mới làm tiếp tiến trình đang dang dở.
- Không được để nợ dữ liệu bẩn kéo dài sang các bước sau vì sẽ làm sai Dashboard, Profit, OMS, ADS, chat và các core dùng chung.
- Khi làm sạch dữ liệu phải ghi rõ:
  - nguyên nhân dữ liệu bẩn,
  - phạm vi shop/sàn bị ảnh hưởng,
  - cách làm sạch,
  - dữ liệu nào đã được sửa thật,
  - dữ liệu nào mới chỉ được gắn cờ chờ xử lý tiếp.

## Checklist endpoint marketplace

- Checklist tổng thể endpoint phải được lưu và cập nhật tại:
  - `docs/marketplace-endpoint-master-checklist.md`
  - `docs/marketplace-endpoint-progress.md`
- Mỗi khi hoàn tất một phase liên quan đến `Shopee`, `Lazada`, `TikTok`, agent bắt buộc phải cập nhật lại 2 file này trước khi kết thúc:
  1. tick lại checklist nhóm tính năng đã làm,
  2. ghi rõ trạng thái `đã xong / đang làm dở / chưa làm / bị khóa an toàn / bị chặn bởi quyền/app`,
  3. ghi rõ shop `có API` đang chạy được gì,
  4. ghi rõ shop `không có API` đang fallback theo cách nào,
  5. ghi rõ bước tiếp theo cần làm để nối tiếp không bị đứt tiến trình.
- Không được chỉ trả lời trong chat mà không cập nhật lại checklist trong repo, vì mục tiêu là làm dần đến khi phủ hết toàn bộ khả năng mà bộ endpoint hiện có cung cấp.
