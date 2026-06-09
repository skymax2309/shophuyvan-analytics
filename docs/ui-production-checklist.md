# ShopHuyVan UI Production Checklist

Ngày cập nhật: 2026-05-28

Checklist này bắt buộc cho mọi giao diện user-facing của ShopHuyVan: ADS, Khuyến mãi sàn, OMS Dashboard, Product Master, Nhập hàng, Chat/CSKH, Báo cáo, Phân quyền, Mobile scanner và settings.

## Pass 2026-05-28 - Chat AI phase 2/3/4 evidence và learning controls

- Production URL: `/pages/chat-cskh.html`.
- Deploy: Chat Worker `62809e20-a2d0-4f1f-a407-2c4212eb6ca9`; static `59c78837-7637-4bda-8130-afa431ea3d59`.
- Desktop `1366x900`, tablet `820x1180`, mobile `390x844`: `overflowX=false`.
- UI có khối `AI đã soạn từ dữ liệu đã kiểm`, nút `Duyệt học` và `Hủy học`; bấm `Hủy học` trên production làm khối evidence biến mất sau reject.
- Không lộ từ kỹ thuật thô, không mojibake trong vùng UI kiểm; artifact `E:\shophuyvan-runtime\verification\chat-ai-phase234-20260528\summary-accepted.json`.

## Pass 2026-05-28 - Chat/AI Gemini key append fix

- Trang kiểm: `https://shophuyvan-analytics.nghiemchihuy.workers.dev/settings.html?verify=gemini-append-20260528d`, tab `AI`.
- Layout: card `Kết nối Gemini` đổi label thành `Thêm API Gemini xoay vòng`, placeholder nói rõ `Key cũ vẫn được giữ`, nút `Thêm/Lưu API Gemini`.
- Readback: Chat Worker `/api/chat/ai/status` production trả `gemini_key_count=2`, `ai_status=active`.
- Responsive: desktop `1366x900`, tablet `820x1180`, mobile `390x844` đều `overflowX=false`, không mojibake, không `undefined`, key status hiển thị `Đã lưu 2/5 key Gemini`.
- Deploy: Chat Worker `fde42ef4-81ce-4c38-afdc-696a6563d956`; static `shophuyvan-analytics` version `399e0247-08e2-4cf6-89e0-ad2b9e9bbdfa`.
- Screenshot lưu ngoài repo: `E:\shophuyvan-runtime\verification\gemini-key-append-20260528\desktop.png`, `tablet.png`, `mobile.png`.

## Pass 2026-05-28 - Chat/AI key count và auto-reply settings

- Trang kiểm: `https://shophuyvan-analytics.nghiemchihuy.workers.dev/settings.html?verify=chat-ai-fix-20260528g`, tab `AI`.
- Deploy: Chat Worker `c99b6b56-2f04-442a-8c51-61cf2cb2c8f8`; static UI `0c59ad14-b97f-4998-9cf2-28ceb2ac2784`.
- API readback production: `/api/chat/ai/status` trả `key_count=1`, `settings_key_count=1`, `auto_send=true`, `auto_reply_minutes=5`, `knowledge_entries=0`.
- UI desktop 1366x900: pass, không tràn ngang, hiện `Đã lưu 1/5 key Gemini`, hiện `Đã học 0 câu trả lời tốt. Tự trả lời sau 5 phút khi đủ an toàn.`
- UI tablet 820x1180: pass, không tràn ngang, text không chồng nhau, tab AI và form Gemini/học AI đọc được.
- UI mobile 390x844: pass, không tràn ngang, nút và form đủ vùng bấm, text key count/học AI không bị cắt.
- Screenshot lưu ngoài repo: `E:\shophuyvan-runtime\verification\chat-ai-settings-20260528\desktop.png`, `tablet.png`, `mobile.png`.
- Ghi chú kiểm thật: profile `E:\codex-chrome-profiles\shophuyvan-test` đang khóa CDP nên automated viewport dùng profile runtime tạm ngoài repo; nội dung production DOM đã xác nhận không có mojibake/undefined.

## Pass 2026-05-28 - Trang chủ có lối tắt Cài đặt Chat

- Production URL: `https://shophuyvan-analytics.nghiemchihuy.workers.dev/?verify=chat-settings-home-20260528b`.
- Layout: lưới `Truy cập nhanh` có card `Cài đặt Chat` với mô tả `AI, thông báo`, đặt cạnh nhóm Chat/CSKH và link tới `/settings`.
- Luồng thật: bấm card từ trang chủ mở `https://shophuyvan-analytics.nghiemchihuy.workers.dev/settings`, trang hiển thị `Cài đặt Chat/AI` và cấu hình Gemini.
- Responsive: desktop `1440x900`, tablet `820x1180`, mobile `390x844` đều `overflowX=false`, không lỗi font/mojibake.
- Deploy: static `shophuyvan-analytics` version `355b02f9-ee19-470e-a7cc-7e78af8a5e61`; artifact `artifacts/home-chat-settings-20260528a/summary.json`.
- Guard: `node --check apps/fe/js/dashboard-home.js`, `node scripts/test-ui-design-system-guard.mjs --files apps/fe/index.html apps/fe/js/dashboard-home.js apps/fe/css/dashboard-home.css` pass.

## Pass 2026-05-28 - ADS Cài đặt tự động ROAS/resume

- Production URL: `https://shophuyvan-analytics.nghiemchihuy.workers.dev/pages/ads.html?verify=ads-auto-settings-final-20260528`.
- Layout: tab `Cài đặt` không còn panel `Điều chỉnh chiến dịch thủ công`; có `ROAS mục tiêu áp dụng toàn bộ chiến dịch`, block `Bật lại sau khi tạm dừng` và toggle `Cho phép tự bật lại campaign đã tạm dừng`.
- Readback: Worker `/api/ads/automation/settings` trả `roas_target=20`, `good_roas=20`, `auto_resume_enabled=true`, `resume_roas_multiplier=1.3`, `resume_stock_multiplier=2`, `max_resume_per_day=2`.
- Responsive: desktop `1440x900`, tablet `820x1180`, mobile `390x844` đều `overflowX=false`, không có panel thủ công.
- Deploy: Worker `huyvan-worker-api` version `661da300-3a63-4ff0-91c8-ea7ae1055c4c`; static `shophuyvan-analytics` version `9ddf1c73-03b7-44f1-8a72-de13bd7ec7c8`; artifact `E:\shophuyvan-runtime\verification\ads-redesign-20260528h\`.
- Guard: `node scripts/test-ads-automation-engine.mjs`, `node scripts/test-ui-design-system-guard.mjs --files ...`, `node --check` các JS đã sửa pass. `scripts/test-ads-operations-ui.mjs` còn fail ở Promotion UI ngoài scope.

## Pass 2026-05-28 - ADS redesign Cài đặt/Cần xử lý/Lịch sử

- Production URL: `https://shophuyvan-analytics.nghiemchihuy.workers.dev/pages/ads.html?verify=ads-redesign-20260528g`.
- Layout: tab đúng `Tổng quan`, `Cần xử lý`, `Cài đặt`, `Lịch sử`; tab Cài đặt có 8 step/status, 3 nút hành động chỉ ở hero, không lặp ở trạng thái.
- Tổng quan: chart `Xu hướng 7 ngày` hiển thị đủ 7 ngày thật `05-22` -> `05-28`, không còn `Chưa có`; Top SKU ưu tiên không đè nút/huy hiệu, `cardOverlapCount=0`.
- Cần xử lý: table desktop có cột `Trạng thái`, row danger/watch có màu nền; mobile card có tooltip ROAS/ACOS.
- Responsive: desktop `1440x900`, tablet `820x1180`, mobile `390x844` đều `overflowX=false`, tooltip mở được, không overlap chart/Top SKU.
- Deploy: Static `shophuyvan-analytics` version `ba350301-eb6e-4003-bc95-d328c1668942`; artifact `E:\shophuyvan-runtime\verification\ads-redesign-20260528g\`.
- Guard: `node scripts/test-ui-design-system-guard.mjs`, `node --check apps/fe/js/dashboard/ads/ads-end-user-ui.js`, `node --check apps/fe/js/dashboard/ads.js` pass.

## Pass 2026-05-28 - Chat/CSKH Cài đặt AI redesign

- Production URL: `https://shophuyvan-analytics.nghiemchihuy.workers.dev/pages/chat-cskh.html?verify=ai-panel-20260528f`.
- Layout: panel `Cài đặt AI` lấy lại cấu trúc từ HTML redesign, có khối `Kết nối AI`, nút riêng `Lưu API Gemini`, model Gemini, API key xoay vòng, quyền hạn AI, từ khóa không được gửi và bộ nhớ kiến thức AI.
- Responsive: desktop `1920x1080`, tablet `820x1180`, mobile `390x844` đều `overflowX=false` ở document/detail, không mojibake, nút lưu API Gemini hiện ngay dưới ô nhập key.
- Luồng thật: desktop bấm `Lưu API Gemini` khi ô key trống để không ghi key giả; Chat Worker trả `POST /api/chat/settings=204` và `GET /api/chat/settings=200`; UI hiện `Đã lưu API Gemini.`.
- Deploy: Static `shophuyvan-analytics` version `05177fc1-9210-4536-b8bf-8a49b4b8ce72`; artifact ảnh/JSON `artifacts/chat-core/ai-panel-20260528f/`.
- Guard: `node scripts/test-ui-design-system-guard.mjs` pass; `node --check` các module Chat đã sửa pass.

## Pass 2026-05-27 - Chat/CSKH AI settings + notification switch

- Production URL: `https://shophuyvan-analytics.nghiemchihuy.workers.dev/pages/chat-cskh.html?verify=ai-settings-20260527e`.
- Layout: topbar có công tắc `Thông báo`; tab `Cài đặt AI` mở rộng thành workspace gồm Gemini keys xoay vòng, từ khóa hạn chế, bộ nhớ kiến thức và thanh lưu cài đặt.
- Responsive: desktop `1366x900`, tablet `820x1180`, mobile `390x844` đều `overflowX=false`, không chồng chữ, không mojibake, các textarea/nút lưu dùng được.
- Guard: `node scripts/test-ui-design-system-guard.mjs` pass; final console desktop không còn `consoleErrors`/`httpErrors`.
- Deploy: Static `shophuyvan-analytics` version `5007da05-5d13-4f35-82f5-f19b652bf45e`; Chat Worker `d415164a-a7ab-4d6b-ab9a-a5fa5e15ead8`.

## Pass 2026-05-27 - Chat/CSKH read-state sau Sync

- Trang kiểm: `/pages/chat-cskh.html`, module `index.js?v=chat-read-state-20260527a`.
- Luồng thật: tìm `tien2612` -> xác nhận `Đã đọc` -> bấm `Sync ngay` nhiều lượt -> reload trang -> xác nhận vẫn `Đã đọc`, snippet không lùi.
- Kết quả responsive: desktop `1366x900`, tablet `820x1180`, mobile `390x844` đều không có badge chưa đọc sai và `overflowX=false`.
- Deploy kiểm: Chat Worker `565616af-7f81-4235-a97f-b11b101c97b4`; static `da275551-9137-4f5f-9dd3-691e58ef0df2`.

## Pass 2026-05-27 - TikTok sender label + OMS Nhắn khách

- Production Chat TikTok: hội thoại `thietbidiencoban.123` hiện nhãn `Shop / 0909128999` và `Hệ thống / Hệ thống TikTok`; hội thoại đơn `584128214410102531` hiện `Khách` và `Shop` đúng phía.
- Desktop `1536x900`, tablet `820x1180`, mobile `390x844`: `overflowX=false`, label không đè nội dung. Screenshots: `tmp-verification/chat-tiktok-sender-20260527/tiktok-sender-{desktop-final-f,tablet-final-f,mobile-final-f}.png`.
- Tab `Sản phẩm`: tìm `k243`, bấm `Gửi` SKU `20BOTACKE5X30MMK243` chèn tóm tắt sản phẩm vào bản nháp gửi tay, không gửi giả; screenshot `tmp-verification/chat-tiktok-sender-20260527/tiktok-k243-manual-draft-final-f.png`.
- OMS production profile `E:\codex-chrome-profiles\shophuyvan-test`: bấm `Nhắn khách` đơn `260527G4WW0496` mở đúng `dungnguyen_12111989`, giữ bản nháp xác nhận, hiện đơn/sản phẩm/tracking và modal timeline. Screenshots: `tmp-verification/order-chat-deeplink-20260527/oms-static-13385-final.png`, `oms-static-13385-timeline-verified.png`.

## Pass 2026-05-27 - Chat/CSKH no-API context

- Production URL: `https://shophuyvan-analytics.nghiemchihuy.workers.dev/pages/chat-cskh.html`.
- Flow đã thao tác thật bằng Codex Browser: tìm mã đơn `584128214410102531`, mở hội thoại TikTok no-API, kiểm tab `Đơn` và `Sản phẩm`.
- Desktop `1366x900`, tablet `820x1180`, mobile `390x844`: `overflowX=false`, thấy customer `nguyn.xun.ha.63574`, order `Đã giao · 33.000đ`, product/SKU và tracking `BEST Express / TTVN1088367610`.
- Screenshots: `tmp-verification/chat-automation-20260527/desktop.png`, `tablet.png`, `mobile.png`.

## A. Trước Khi Code

- Đã đọc `AGENTS.md`.
- Đã đọc `shophuyvan-ui-end-user-guard`.
- Đã đọc `shophuyvan-ui-design-system-guard`.
- Đã đọc `docs/ui-design-system.md`.
- Đã xác định người dùng cần làm gì trên trang.
- Đã xác định dữ liệu nguồn và Core/Warehouse read-model liên quan.
- Đã có layout text: header, filter, summary, main table/card, drawer/modal, empty/error state.
- Đã xác định action chính và blocker an toàn nếu action không được phép.

## B. Sau Khi Code

- Không có text kỹ thuật trên UI người dùng cuối: endpoint, payload, route, request_id, JSON, raw log, cache, guard, Core, read-model.
- Không có nút `Chi tiết kỹ thuật` trên giao diện người dùng cuối.
- Không có card trắng lệch dark theme.
- Không có text overlap.
- Không có icon overlap.
- Không lạm dụng tooltip hoặc icon chú thích; không có icon `?` rải khắp KPI, bảng, badge và nút hành động.
- Không có height cố định làm cắt chữ với nội dung động.
- Không có scrollbar nội bộ vô lý trong summary card.
- Không dùng native select cho danh sách dài campaign/product.
- Cột số tiền, số lượng, tồn kho, ROAS, ACOS căn phải và dùng tabular numbers.
- Header và cell số liệu cùng trục; badge/action không chen vào cột số.
- Badge nói vấn đề thật như `Không hiệu quả`, `ROAS thấp`, `Lãi âm`, `Thiếu giá vốn`; không dùng badge `Giảm 30%` đứng một mình.
- Cột `Vấn đề` và `Hành động` tách riêng; action chính là nút rõ như `Tạm dừng`, `Giảm ngân sách`, `Giữ ADS`, `Bật lại`.
- Loading state có đủ.
- Empty state có đủ.
- Error state có đủ.
- Success state hoặc trạng thái hoàn tất có đủ.
- Tooltip/chú thích chỉ dùng khi thật cần và không làm rối màn chính.
- Action chính rõ và dễ bấm.

## C. Responsive

- Desktop `1366x900` pass: không tràn ngang, table/action/filter dùng được.
- Tablet `820x1180` pass: không overlap, filter không chiếm quá cao, drawer/modal dùng được.
- Mobile `390x844` pass: không tràn ngang, table chuyển card list nếu cần, action chính bấm được.

## D. Production

- Đã mở production thật bằng profile đúng.
- Đã thao tác action chính ở mức an toàn.
- Đã reload lại trang.
- Không lỗi console nghiêm trọng.
- Không có `Failed to fetch`.
- Không tràn ngang.
- Nếu còn trang vi phạm rule, đã ghi vào `docs/PROJECT-CURRENT-STATE.md` mục UI debt.
### Customer Database UI

- Trang khách hàng sàn phải đọc Customer Core, không đọc DOM đơn hàng trong frontend.
- Bắt buộc kiểm mobile `390x844`, tablet `820x1180`, desktop `1366x900`.
- Không thêm nút xuất Facebook/Zalo hoặc tự động kết bạn nếu chưa có consent/contact guard riêng.
- Bảng phải có cột riêng `Tên khách hàng`, `SĐT`, `Địa chỉ`, `ID khách hàng`; danh sách hiển thị phải lọc trùng trước khi render.
- Nút tải dữ liệu chỉ xuất file nội bộ từ Customer Core, không tự đẩy sang Facebook/Zalo.
- 2026-05-27 Chat/CSKH font hotfix: production `https://shophuyvan-analytics.nghiemchihuy.workers.dev/pages/chat-cskh.html?verify=fontfix-20260527d` đã kiểm desktop/tablet/mobile bằng profile `E:\codex-chrome-profiles\shophuyvan-test`; không còn marker mojibake `�/Ä/Ã/Â/áº`, UI tiếng Việt có dấu hiển thị đúng, không tràn ngang. Static version `546c73cf-b9c5-48b9-8dda-287734ba23e8`.
## 2026-05-28 - Chat/CSKH settings, realtime, keyword guard

- Production URL: `https://shophuyvan-analytics.nghiemchihuy.workers.dev/pages/chat-cskh.html?verify=chat-ai-realtime-20260528g` và `https://shophuyvan-analytics.nghiemchihuy.workers.dev/settings.html?verify=chat-ai-settings-20260528g`.
- Deploy: Chat Worker `shophuyvan-chat-api` version `7af1b583-f3ca-4204-af47-95e55c23dd00`; static `shophuyvan-analytics` version `39d860d1-3103-47de-a699-94e2d2047870`.
- Desktop/tablet/mobile pass: không tràn ngang, không mojibake, không console/http error. Chat composer gõ `zalo` hiện cảnh báo từ khóa cấm; Settings có đủ 6 tab và nút `Lưu API Gemini`.
- Giới hạn còn lại: push iPhone cần Safari Home Screen + quyền notification; Chrome profile kiểm thử đang bị chặn notification nên không xác nhận OS notification thật trên profile đó.
