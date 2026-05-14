# Checklist Tổng Thể Endpoint Marketplace

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
- `chat_transport_core`
- `chat_identity_core`
- `chat_scan_policy_core`
- `video_library_core`
- `video_analytics_core`
- `marketplace_push_core`
- `promotion_tool_core`
- `review_core`
- `return_complaint_core`
- `customer_risk_core`

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
  - Trang ADS đã chia thành các page con `Tổng quan / Guard ADS / TopPicks / Discount / Khuyến mãi sàn` để giảm kéo trang dài
  - Guard ADS đã chia thêm tab con `Quy trình chuẩn / Shop / API / Preview thao tác / Log đối soát`, có checklist thao tác đúng thứ tự để người vận hành biết cách check ADS trước khi đẩy thật
  - Guard preview `budget / trạng thái / keyword`
  - Refactor 2026-05-13 đã tách ADS frontend theo core tự trị: `ads.js` chỉ còn loader, logic nằm trong `apps/fe/js/dashboard/ads/`, CSS riêng ở `apps/fe/css/ads-page.css`, `ads.html` dưới 30KB; production version `d84c66ad-5db2-4b01-9ce4-97450a6bc025` đã kiểm desktop/mobile.
  - Log request/preview ADS
  - Trang ADS đã có panel `Review xấu trùng ADS` và cột `Review` trong bảng SKU/campaign, đọc chung `review_core`
  - OMS Dashboard / Trung tâm API đã có action đọc `get_open_campaign_added_product` ở chế độ read-only
- `Đang làm dở`
  - phân tích sâu campaign/adgroup theo từng sàn
- `Bị chặn bởi quyền/app`
  - Shopee AMS Affiliate/Open Campaign có thể trả lỗi nếu shop chưa đồng ý AMS T&C hoặc app thiếu quyền `Affiliate Marketing Solution Management`
- `Bị khóa an toàn`
  - bật/tắt ADS thật trực tiếp

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
- `Đang làm dở`
  - gửi text live Lazada qua OMS bằng IM API thật sau khi chốt câu test an toàn
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
- [ ] Hoàn thiện `chat_identity_core`
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
- Shopee có API: `Discount`, `Voucher`, `Bundle Deal`, `Add-On Deal`, `ShopFlashSale` đã có sync read-only, lưu vào D1; Discount mở `update_discount_item`, còn Voucher/Bundle/Add-On/Flash Sale mở route ghi thật có preview payload, quyền admin, chuỗi xác nhận và log action trước khi gửi Shopee.
- Lazada có API: `Seller Voucher API`, `Free Shipping API`, `Flexicombo API` đã có sync read-only, lưu vào D1; Flexicombo production hiện chưa có chương trình phát sinh.

### Luồng shop không có API

- Chỉ dùng dữ liệu tham chiếu từ đơn/report/import/browser có log.
- Không gắn nhãn “đồng bộ API” hoặc “tạo voucher bằng Open Platform” cho shop chưa có API.

### Trạng thái hiện tại

- `Đã xong`
  - tạo `promotion_tool_core` đọc/tổng hợp tại `/api/discounts/promotion-tool-core`
  - Shopee Discount đã có sync read-only, phân tích ADS/tồn và action guard an toàn ở `/api/discounts/shopee/*`
  - Shopee Discount 2026-05-10 đã mở đẩy giá thật qua `update_discount_item`: UI bắt buộc hộp xác nhận OK/Cancel, backend bắt buộc quyền admin và dòng gộp nhiều phân loại vẫn bị chặn
  - Shopee Voucher đã có sync read-only tại `/api/discounts/shopee/vouchers/sync`, lưu cache `marketplace_vouchers`
  - Lazada Seller Voucher đã có sync read-only tại `/api/discounts/lazada/vouchers/sync`, lưu cache `marketplace_vouchers`
  - Shopee Bundle/Add-On/Flash Sale đã có sync read-only tại `/api/discounts/shopee/promotions/sync`, lưu cache `marketplace_promotion_programs` và `marketplace_promotion_items`
  - Lazada Free Shipping/Flexicombo đã có sync read-only tại `/api/discounts/lazada/promotions/sync`, lưu cache chương trình khuyến mãi chung
  - ADS page đã có panel/page con `Khuyến mãi sàn`: tải core, cập nhật cache read-only, hiển thị voucher/program/SKU đang giảm giá + ADS + tồn
  - UI `Khuyến mãi sàn` 2026-05-10 đã tách thành tab con `Tổng quan core`, `Cập nhật cache`, `Danh sách`, `Chi tiết / giá`, `Hàng đợi duyệt`; thêm nút `Cập nhật theo bộ lọc` để cập nhật read-only đúng nguồn/sàn/module/trạng thái đang chọn
  - UI `Khuyến mãi sàn` 2026-05-10 đã thêm tab `Tính năng`: hiển thị 9 nhóm Shopee/Lazada, trạng thái đọc cache, trạng thái ghi thật và nút mở đúng luồng cho từng module
  - UI `Khuyến mãi sàn` 2026-05-10 đã thêm lưới nút nhanh theo từng tính năng có thể cập nhật: Shopee Voucher/Bundle/Add-On/Flash, Lazada Voucher/Freeship/Flexicombo, toàn bộ read-only, batch sâu, làm sạch giá và hàng đợi duyệt; Lazada Early Bird hiển thị nhưng disabled vì còn khóa ghi thật
  - UI danh sách chương trình đã tách `cache item/SKU` và `sàn báo` để không nhầm Flash Sale/Bundle/Add-On có số lượng từ list là đã có đủ item chi tiết trong cache
  - UI `Khuyến mãi sàn` đã có danh sách voucher/program, mở chi tiết chương trình và preview payload giá theo tồn kho ở chế độ khóa apply thật
  - `Khuyến mãi sàn` 2026-05-13 đã làm rõ tiếng Việt và thao tác vận hành: tab `Danh sách` hiện `Xóa cache` + nút trạng thái theo từng dòng, tab `Chi tiết / giá` có empty state rõ ràng, tab `Hàng đợi duyệt` đổi nhãn raw sang `Mua kèm deal · Quy tắc giá theo tồn kho`, và `promotion_tool_core` không còn dàn cùng một spend ADS vào mọi SKU khi campaign chưa map được SKU; phần chưa map được tách riêng `campaign ADS chưa map được SKU`.
  - Batch sâu thủ công `/api/discounts/promotion-cache/batch` và alias `/api/discounts/promotions/deep-sync` đã deploy; cron Worker chạy lát cắt nhỏ theo shop/module để cache sâu dần mà không vượt quota
  - `promotion-stock-price-rule-core` đã chuẩn hóa rule giá theo tồn kho dùng chung, trả payload preview và log action an toàn, chưa gửi lên sàn
  - Production đã kiểm trang thật: Shopee Bundle có 54 dòng list, mở được chương trình 5 item, preview trả `apply_locked=true`, mobile 390px không tràn ngang
  - route làm sạch cache `promotion-items/repair-prices` đã map giá/tồn từ `product_variations`; production đã cập nhật 5/8 dòng Shopee Bundle trong lượt kiểm
  - route chi tiết SKU `promotion-sku-detail` đã gom promotion + tồn + ADS + doanh thu + giá vốn để kiểm lãi trước khi duyệt
  - Refactor 2026-05-13 đã tách `discounts.js` thành wrapper và module theo `common`, `shopee/discounts`, `shopee/vouchers`, `shopee/promotions`, `lazada/vouchers`, `lazada/promotions`; toàn bộ file trong cụm này dưới 30KB, contract route cũ giữ nguyên.
  - Shopee Voucher/Bundle/Add-On/Flash Sale 2026-05-13 đã mở adapter ghi thật qua `/api/discounts/shopee/promotion-action`: hỗ trợ preview, gửi thật sau xác nhận, xóa/kết thúc hàng loạt theo danh sách đã tick và form tạo Flash Sale theo giờ bắt đầu/kết thúc.
  - hàng đợi duyệt apply `promotions/queue-apply` và `promotions/apply-queue` đã có quyền admin, risk summary, rollback payload và log `sent_to_platform=false`
  - Lazada Early Bird đã chốt `preview_only_locked`: có preview endpoint ghi giá nhưng không mở apply thật
- `Đang làm dở`
  - cache sâu cho toàn bộ lịch sử promotion tiếp tục được lấp bằng cron lát cắt; chưa ép một lượt lớn để tránh quota Worker
  - một số item của Bundle/Add-On/Flash Sale vẫn chưa map được sang `product_variations`, trạng thái hàng đợi sẽ là `needs_data` cho tới khi bổ sung dữ liệu
  - Lazada Flexicombo gọi endpoint thành công nhưng production hiện trả `0` chương trình
- `Chưa làm`
  - màn hình duyệt hàng đợi nâng cao cho approve/reject nhiều dòng
- `Bị khóa an toàn`
  - Lazada freeshipping, flexicombo và Early Bird thật vẫn khóa ở tầng gửi sàn; Shopee Discount/Voucher/Bundle/Add-On/Flash Sale đã mở gửi thật nhưng vẫn bắt buộc preview, quyền admin, xác nhận và log.

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
- [x] Adapter gửi thật Shopee Voucher/Bundle/Add-On/Flash Sale có preview, admin confirm và log

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

