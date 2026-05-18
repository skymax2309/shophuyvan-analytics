# Hướng Dẫn Cho Codex / Agent

> File này được lưu bằng UTF-8. Nếu PowerShell hiển thị tiếng Việt bị lỗi, mở bằng VS Code với encoding UTF-8 hoặc chạy PowerShell ở UTF-8.

## 1. Mục tiêu chung

Agent phải làm việc theo hướng an toàn, có kiểm chứng thực tế, dùng đúng Chrome profile, đúng GitHub/Cloudflare theo từng project, và ưu tiên core dữ liệu dùng chung.

Không được báo đã xong nếu mới sửa code nhưng chưa kiểm tra luồng thật, chưa deploy đúng môi trường hoặc chưa bấm thử giao diện đang chạy thật.

## 2. Chrome profile theo project

Bắt buộc chọn đúng Chrome profile theo project, không dùng lẫn và không dùng Chrome mặc định của máy.

### ShopHuyVan / OMS / Product Master

Profile:

`E:\codex-chrome-profiles\shophuyvan-test`

Dùng cho:

- Admin website ShopHuyVan
- ShipXanh
- GitHub ShopHuyVan
- Cloudflare ShopHuyVan
- Shopee Open Platform
- Lazada Open Platform
- Kiểm Product Master, External API, admin web, marketplace docs

### Facebook CRM / Meta

Profile:

`E:\codex-chrome-profiles\fbshv-meta`

Dùng cho:

- Facebook CRM
- Meta/Facebook tools
- GitHub repo Facebook CRM
- Cloudflare project Facebook CRM
- Kiểm giao diện/login/deploy riêng của Facebook CRM

### Quy tắc bắt buộc

- Không dùng profile Chrome mặc định.
- Không tự tạo profile Chrome khác nếu chưa được yêu cầu.
- Không dùng sai profile giữa ShopHuyVan và Facebook CRM.
- Nếu profile chưa đăng nhập, dừng lại và yêu cầu người dùng đăng nhập thủ công.
- Không lưu mật khẩu, OTP, token, cookie hoặc session vào repo/skill/log.
- Trước khi deploy phải xác nhận đang ở đúng repo, đúng GitHub account, đúng Cloudflare account/project.

## 3. Tách project ShopHuyVan và Facebook CRM

ShopHuyVan và Facebook CRM là 2 project khác nhau, có thể nằm ở GitHub repo khác và Cloudflare account/project khác.

### ShopHuyVan

- Là nguồn dữ liệu gốc cho Product Master, SKU, tồn kho, đơn hàng, finance, OMS.
- API chính: `https://huyvan-worker-api.nghiemchihuy.workers.dev`
- Profile kiểm thử: `E:\codex-chrome-profiles\shophuyvan-test`

### Facebook CRM

- Là project riêng.
- Không được deploy Facebook CRM bằng GitHub/Cloudflare của ShopHuyVan.
- Không được deploy ShopHuyVan bằng GitHub/Cloudflare của Facebook CRM.
- Profile kiểm thử: `E:\codex-chrome-profiles\fbshv-meta`

### Kết nối dữ liệu giữa 2 project

Facebook CRM chỉ kết nối sang ShopHuyVan qua External API:

`https://huyvan-worker-api.nghiemchihuy.workers.dev/api/external/*`

Facebook CRM không được tự copy Product Master, không tự quyết định giá cuối, không tự trừ tồn local.

Luồng chuẩn:

ShopHuyVan Product Master  
→ External API `/api/external/*`  
→ Facebook CRM đọc sản phẩm/giá/tồn  
→ Facebook CRM tạo đơn ngược về ShopHuyVan

### Biến môi trường Facebook CRM

Facebook CRM phải dùng env riêng:

```env
ECOMMERCE_API_BASE_URL="https://huyvan-worker-api.nghiemchihuy.workers.dev"
ECOMMERCE_API_KEY=""
ECOMMERCE_WEBHOOK_SECRET=""
MOCK_ECOMMERCE_API="false"
```

### Quy tắc an toàn khi sửa/deploy

Nếu đang ở repo Facebook CRM:

- Chỉ sửa/deploy Facebook CRM.
- Không sửa/deploy Worker ShopHuyVan trừ khi user yêu cầu rõ.

Nếu đang ở repo ShopHuyVan:

- Chỉ sửa Product Master, External API, Inventory, Order, Webhook, OMS.
- Không sửa/deploy Facebook CRM trừ khi user yêu cầu rõ.

Nếu cần sửa cả 2 bên:

- Báo rõ phần nào sửa ở ShopHuyVan.
- Báo rõ phần nào sửa ở Facebook CRM.
- Deploy từng project bằng đúng GitHub/Cloudflare của project đó.
- Kiểm tra từng project bằng đúng Chrome profile tương ứng.

## 4. Quy tắc deploy và kiểm tra thật

Sau khi chỉnh sửa code:

1. Chạy kiểm tra phù hợp:
   - `node --check`
   - `python -m py_compile`
   - test API/helper thực tế
   - mở page trong browser nếu đụng UI
2. Deploy đúng phần bị ảnh hưởng:
   - frontend thì deploy Pages/static
   - worker thì deploy Worker API
   - helper Python thì restart helper/local service nếu code chạy qua service
3. Sau deploy phải kiểm tra lại luồng thực tế:
   - mở web thật
   - bấm nút thật
   - chạy sync/warm/send thật ở mức an toàn
   - xem dữ liệu thật đã ổn định chưa
4. Báo lại rõ:
   - đã sửa gì
   - đã deploy phần nào
   - đã kiểm tra thực tế gì
   - kết quả gì
   - phần nào chưa kiểm được và lý do

Không được báo ổn định nếu mới test local.

## 5. Quy tắc giao diện responsive bắt buộc

Mọi giao diện mới hoặc giao diện sửa lại phải kiểm tra đủ 3 chế độ:

1. Mobile
2. Tablet
3. PC/Desktop

Không được chỉ test trên PC rồi kết luận đã xong.

### Nguyên tắc UI

- Mobile first.
- Dễ bấm, chữ rõ, nút đủ lớn.
- Không tràn ngang.
- Không vỡ layout.
- Tiếng Việt có dấu, nội dung ngắn gọn để đội vận hành dùng trực tiếp.
- Nếu có thể làm chuyên nghiệp hơn ShipXanh thì được phép cải tiến.
- Nếu chưa có hướng UI tốt hơn, phải build gần giống ShipXanh để người dùng quen thao tác.

### Bảng dữ liệu

- PC: có thể dùng table đầy đủ.
- Tablet: table co giãn hợp lý hoặc có scroll ngang rõ ràng.
- Mobile: ưu tiên đổi table thành card/list để dễ đọc và dễ thao tác.

### Tham khảo ShipXanh

Khi cần tham khảo UI, mở ShipXanh bằng profile:

`E:\codex-chrome-profiles\shophuyvan-test`

Tham khảo:

- bố cục
- màu sắc
- khoảng cách
- nút bấm
- card dữ liệu
- tab dữ liệu
- cách hiển thị tiền/phí/trạng thái

## 6. Quy tắc giao diện số liệu nhiều tab

Khi build giao diện hiển thị số liệu, tài chính, đơn hàng, phí sàn, vận chuyển, đối soát hoặc báo cáo, bắt buộc chia dữ liệu thành các tab rõ ràng để người vận hành dễ đọc trên mobile.

### Nguyên tắc chia tab

- Không dồn toàn bộ số liệu vào một màn hình dài.
- Mỗi nhóm số liệu phải có tab riêng hoặc card riêng.
- Ưu tiên bố cục giống ShipXanh: nền tối, card rõ khối, dòng nhãn bên trái, số tiền/trạng thái bên phải.
- Mobile phải ưu tiên tab ngang có thể vuốt hoặc scroll.
- PC có thể hiển thị nhiều cột hơn, nhưng vẫn phải giữ nhóm dữ liệu rõ ràng.

### Các tab nên có khi làm giao diện đơn hàng/tài chính

1. `Thông Tin`
   - Mã đơn hàng
   - Người mua
   - Người nhận
   - Số điện thoại
   - Địa chỉ

2. `Vận Chuyển`
   - Đơn vị vận chuyển
   - Mã vận đơn
   - Thời gian pickup
   - Khối lượng
   - Phí vận chuyển

3. `Khách Thanh Toán`
   - Phương thức thanh toán
   - Tổng tiền sản phẩm
   - Giá sản phẩm ban đầu
   - Shop giảm giá
   - Voucher của shop
   - Voucher từ sàn
   - Phí vận chuyển khách trả
   - Tổng khách thanh toán

4. `Sàn Thanh Toán`
   - Trạng thái thanh toán
   - Tổng tiền sản phẩm
   - Phí vận chuyển thực tế
   - Phí vận chuyển được trợ giá
   - Phí sàn
   - Phí cố định
   - Phí dịch vụ
   - Phí xử lý giao dịch
   - Thuế
   - Thực nhận về ví

5. `Lợi Nhuận`
   - Doanh thu
   - Giá vốn
   - Phí sàn
   - Phí vận chuyển shop chịu
   - Thuế
   - Chi phí khác
   - Lãi ròng
   - Biên lợi nhuận

6. `Lịch Sử`
   - Lịch sử trạng thái
   - Hành trình vận chuyển
   - Hình ảnh nếu có

### Quy tắc hiển thị số liệu

- Số tiền dương dùng màu nổi bật dễ nhìn.
- Số tiền âm, phí hoặc chi phí phải hiển thị rõ là khoản trừ.
- Dòng tổng quan trọng phải đặt cuối card, chữ lớn hơn.
- Các dòng con phải thụt vào dưới dòng cha.
- Không dùng bảng nhiều cột trên mobile nếu làm người dùng phải zoom.
- Mobile ưu tiên dạng card/list giống ShipXanh.
- Tablet có thể dùng card 2 cột nếu đủ rộng.
- PC có thể dùng layout 2-3 cột hoặc table, nhưng vẫn phải giữ tab nhóm.

### Báo cáo sau khi sửa UI số liệu

Bắt buộc báo rõ:

- Mobile: pass/chưa pass
- Tablet: pass/chưa pass
- PC/Desktop: pass/chưa pass
- Tab nào đã kiểm
- Màn hình nào bị tràn ngang
- Dòng số tiền nào khó đọc
- Nút/tab nào khó bấm
- Đã so với giao diện ShipXanh chưa

## 7. Quy tắc core số liệu tài chính dùng chung

Mục tiêu cao nhất là mọi luồng đều dùng cùng một nguồn số liệu chuẩn hóa để đảm bảo các màn hình sau hiển thị cùng một kết quả:

- Dashboard
- Profit
- Chi tiết đơn
- Chat
- OMS
- Đối soát
- Báo cáo tài chính
- Báo cáo thuế
- ADS
- Cron
- Automation
- Export Excel

### Kiến trúc bắt buộc

Luồng chuẩn:

API sàn  
→ Raw data gốc  
→ Finance Core chuẩn hóa  
→ Lưu snapshot D1  
→ Mọi page/module đọc lại cùng nguồn dữ liệu

Không được:

- Mỗi page tự tính một kiểu.
- Dashboard tính khác chi tiết đơn.
- Profit tính khác báo cáo.
- OMS hiện khác chat.
- Frontend tự cộng trừ riêng không qua core.

### Các field tài chính phải chuẩn hóa

Ví dụ các field cần dùng chung:

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

Mọi nơi phải dùng cùng field và cùng công thức.

### Quy tắc nguồn dữ liệu

Mỗi số liệu phải có metadata:

- `value`
- `source`
- `confidence`
- `updated_at`

Ví dụ:

```json
{
  "shop_discount_amount": {
    "value": 15000,
    "source": "Shopee API",
    "confidence": "confirmed",
    "updated_at": "2026-05-18T10:00:00Z"
  }
}
```

### Thứ tự ưu tiên dữ liệu

Ưu tiên số liệu theo thứ tự:

1. API chính thức của sàn.
2. Snapshot D1 đã chuẩn hóa.
3. Cost setting fallback.
4. Estimated/fallback calculation.

### Shop có API

Nếu shop có API:

- Bắt buộc dùng số liệu thật từ API làm nguồn chuẩn.
- Không override bằng cost setting nếu API đã có dữ liệu.
- Cost setting chỉ dùng để bù field API còn thiếu.
- UI phải ghi rõ field nào là API, field nào là fallback.

### Shop chưa có API

Nếu shop chưa có API:

- Bắt buộc fallback sang `cost setting`.
- UI phải hiện rõ:
  - `Dữ liệu tham chiếu từ cost setting`
  - hoặc `Shop chưa có API tài chính`
- Không được gắn nhãn `Đối soát chính xác`, `Số liệu API`, hoặc `Lợi nhuận chuẩn` nếu thực tế đang dùng cost setting fallback.

### Quy tắc hiển thị UI

Nếu field là fallback hoặc estimated, phải hiển thị badge/trạng thái rõ ràng:

- `API`
- `Fallback`
- `Estimated`
- `Missing`

Ví dụ:

- Phí sàn: `-15.930đ (API)`
- Giá vốn: `-22.000đ (Cost Setting)`
- Lãi ròng: `57.945đ (Estimated)`

Nếu không đủ dữ liệu:

- Hiển thị `Chưa có dữ liệu`.
- Không tự đoán âm thầm.

### Quy tắc kiểm tra đồng nhất số liệu

Nếu cùng một số liệu xuất hiện ở nhiều nơi, bắt buộc kiểm tra đồng nhất ở:

- Dashboard
- Chi tiết đơn
- Profit page
- Export Excel
- Chat order card
- OMS
- Báo cáo tháng

Nếu lệch:

- Phải sửa core trước.
- Không patch riêng từng page.

### Quy tắc snapshot D1

- Snapshot D1 là nguồn đọc chính cho analytics.
- Không spam gọi API theo từng dòng.
- Batch theo ngày/tháng/shop.
- API chỉ dùng để sync hoặc làm giàu phần còn thiếu.

### Quy tắc debug số liệu

Mỗi số liệu phải trace được:

- lấy từ endpoint nào
- snapshot nào
- công thức nào
- fallback nào
- sync lúc nào

Khi user báo số liệu sai:

- phải debug từ core/source trước
- không sửa UI tạm thời để che lỗi

## 8. Quy tắc order_fee_details / fee_breakdown / popup phí OMS

Khi sửa `order_fee_details`, `fee_breakdown` hoặc popup phí OMS:

- Không tự tính phí riêng trong popup OMS.
- Tạo hoặc dùng Finance Core chung để chuẩn hóa phí.
- `order_fee_details` và `fee_breakdown` phải đọc cùng một nguồn dữ liệu.
- Popup OMS chỉ render dữ liệu đã chuẩn hóa, không tự cộng trừ riêng.
- Nếu shop có API thì ưu tiên số liệu API/snapshot D1.
- Nếu shop chưa có API thì fallback cost setting và phải hiện badge `Fallback` hoặc `Estimated`.
- UI popup phí phải chia tab/card rõ ràng:
  - `Khách Thanh Toán`
  - `Sàn Thanh Toán`
  - `Phí Sàn`
  - `Vận Chuyển`
  - `Thuế`
  - `Lợi Nhuận`
- Mobile/tablet/PC đều phải kiểm thật sau deploy.
- Nếu số liệu lệch giữa OMS, chi tiết đơn, Profit, Dashboard thì sửa core trước, không patch từng page.

Hướng chuẩn:

Raw API / fallback cost setting  
→ finance_fee_core  
→ normalized_fee_breakdown  
→ order_fee_details  
→ OMS popup chỉ render

## 9. Quy tắc Product Master dùng chung

Product, SKU, giá bán, giá vốn, tồn kho, giảm giá, ảnh sản phẩm và trạng thái sản phẩm phải đi qua Product Master.

Không được để mỗi luồng tự giữ dữ liệu sản phẩm riêng.

### Luồng chuẩn

API sàn / import file / nhập tay  
→ Product Master  
→ Snapshot D1  
→ Dashboard, OMS, Chat, Facebook CRM, Profit, Order cùng đọc lại

### Product Master là nguồn chuẩn

- `products` và `product_variations` là nguồn đọc sản phẩm/giá/tồn.
- Facebook CRM chỉ được đọc sản phẩm, kiểm tồn, giữ hàng và tạo đơn qua `/api/external/*`.
- Facebook CRM không được tự quyết định giá cuối.
- Facebook CRM không được tự trừ tồn kho local.
- API tạo đơn dùng giá hiện tại trong Product Master, không để CRM tự quyết định giá cuối.

### Endpoint External API cho Facebook CRM

Facebook CRM đọc dữ liệu ShopHuyVan qua:

- `GET /api/external/products`
- `GET /api/external/products/{id}`
- `GET /api/external/products/sku/{sku}`
- `GET /api/external/products/sku/{sku}/price`
- `POST /api/external/inventory/check`
- `POST /api/external/inventory/reserve`
- `POST /api/external/inventory/reservations/{reservationId}/cancel`
- `POST /api/external/inventory/reservations/{reservationId}/commit`
- `POST /api/external/orders/from-facebook`
- `GET /api/external/orders/{orderId}`
- `GET /api/external/orders/source/{sourceOrderId}`
- `POST /api/external/webhook/test`
- `GET /api/external/webhook/deliveries`

### Quy tắc Facebook CRM khi dùng sản phẩm

Trước khi tư vấn khách hoặc tạo đơn Facebook, bắt buộc gọi:

`GET /api/external/products/sku/{sku}/price`

Trước khi chốt đơn, bắt buộc gọi:

`POST /api/external/inventory/check`

Khi khách đang chốt, dùng:

`POST /api/external/inventory/reserve`

Khi tạo đơn, dùng:

`POST /api/external/orders/from-facebook`

### Quy tắc xử lý lệch SKU/giá/tồn

Nếu SKU, giá hoặc tồn bị lệch giữa các màn hình:

- phải sửa Product Master/core trước
- không patch riêng từng page
- phải kiểm lại Dashboard, OMS, Facebook CRM, Chat và Order detail

## 10. Quy tắc endpoint marketplace

Checklist tổng thể endpoint phải được lưu và cập nhật tại:

- `docs/marketplace-endpoint-master-checklist.md`
- `docs/marketplace-endpoint-progress.md`

Mỗi khi hoàn tất một phase liên quan đến `Shopee`, `Lazada`, `TikTok`, agent bắt buộc phải cập nhật lại 2 file này trước khi kết thúc:

1. tick lại checklist nhóm tính năng đã làm
2. ghi rõ trạng thái `đã xong / đang làm dở / chưa làm / bị khóa an toàn / bị chặn bởi quyền/app`
3. ghi rõ shop `có API` đang chạy được gì
4. ghi rõ shop `không có API` đang fallback theo cách nào
5. ghi rõ bước tiếp theo cần làm để nối tiếp không bị đứt tiến trình

Không được chỉ trả lời trong chat mà không cập nhật lại checklist trong repo.

## 11. Quy tắc dữ liệu bẩn

Nếu phát hiện dữ liệu bẩn, dữ liệu cũ lệch chuẩn, dữ liệu trùng hoặc dữ liệu đang làm sai kết quả thì phải ưu tiên làm sạch, chuẩn hóa hoặc gắn cờ xử lý dứt điểm trước rồi mới làm tiếp tiến trình đang dang dở.

Không được để nợ dữ liệu bẩn kéo dài sang các bước sau vì sẽ làm sai Dashboard, Profit, OMS, ADS, chat và các core dùng chung.

Khi làm sạch dữ liệu phải ghi rõ:

- nguyên nhân dữ liệu bẩn
- phạm vi shop/sàn bị ảnh hưởng
- cách làm sạch
- dữ liệu nào đã được sửa thật
- dữ liệu nào mới chỉ được gắn cờ chờ xử lý tiếp

## 12. Quy tắc tư vấn tính năng mới

Với tính năng mới hoặc phần sửa ảnh hưởng rộng, trước khi làm lớn phải đưa ra nhiều phương án xử lý, nêu:

- ưu/nhược điểm
- số request dự kiến
- độ chính xác dữ liệu
- rủi ro vận hành
- tác động maintain

Với phần ảnh hưởng rộng tới tài chính, chat, AI auto-reply, automation hoặc kiến trúc page, phải hỏi/chốt lại hướng với người dùng trước khi đi sâu.

Luôn ưu tiên phương án có core dữ liệu dùng chung: một nơi chuẩn hóa, một nơi đồng bộ, nhiều màn hình chỉ đọc lại.

## 13. Quy tắc shop có API và shop không API

Bắt buộc tách luồng ngay từ đầu giữa:

- shop có API
- shop không có API

UI, backend, cron và helper local không được dùng chung một luồng mơ hồ rồi đoán shop nào chạy API.

Mọi màn hình phải hiện rõ shop đang ở chế độ nào.

### Shop có API

- Ưu tiên dữ liệu API chính thức.
- Lưu snapshot.
- Hiển thị source rõ ràng.
- Nếu thiếu endpoint, báo đúng tên endpoint cần tìm.

### Shop không có API

- Có luồng vận hành riêng:
  - dữ liệu tham chiếu
  - import file
  - browser hỗ trợ có kiểm soát
  - thao tác tay có log
  - cost setting fallback
- Không được gắn nhãn “đồng bộ API” cho shop chưa có API.

## 14. Quy tắc chat sàn

Chat là luồng vận hành chính, không được chấp nhận trạng thái “vào là loading mãi, lâu lâu mới lên”.

Nếu gặp lỗi này phải điều tra đến tận gốc:

- API/token
- browser helper
- policy quét
- DB
- render frontend

Tin nhắn TikTok/Shopee/Lazada phải qua core lọc nhiễu trước khi lưu hoặc hiển thị.

Khi liên kết đơn hàng trong chat, trạng thái hiển thị phải dùng core trạng thái đơn, không hiển thị raw nếu đã có nhãn tiếng Việt.

Sau mỗi đợt sửa chat, báo lại rõ 4 nhóm:

1. Shop API đã làm được gì bằng API chính thức.
2. Shop API còn đang thiếu quyền gì.
3. Shop không API đang fallback bằng cách nào.
4. Tính năng nào mới chỉ lưu OMS/chờ xác nhận gửi lên sàn.

## 15. Quy tắc cấu trúc code

### Frontend

- `apps/fe`: frontend tĩnh chạy trên Pages/static server.
- Page chính nằm ở `apps/fe/pages`.
- Logic chia theo `apps/fe/js/dashboard`, `apps/fe/js/modules`, `apps/fe/js/admin`.
- Frontend chỉ giữ phần hiển thị và gọi API; backend/core giữ nghiệp vụ và chuẩn hóa dữ liệu.

### Worker API

- `apps/worker-api`: Cloudflare Worker API, D1, R2 và cron.
- Route nằm ở `apps/worker-api/src/routes`.
- Helper DB ở `apps/worker-api/src/utils`.
- Core backend đặt ở `apps/worker-api/src/core`.

### Python local automation

- Python local automation nằm ngoài repo chính:
  `E:\shophuyvan-python-automation`
- Code thật nằm trong:
  `E:\shophuyvan-python-automation\oms_python`
- Không tạo thêm Python mới trong repo chính nếu tính năng thuộc OMS vận hành.
- File entrypoint ở root chỉ nên là launcher mỏng như `main.py`.
- Code nghiệp vụ phải nằm trong `oms_python`.

## 16. Quy tắc tách nội dung thành Skill

Nếu trong quá trình làm việc thấy có quy trình, checklist, chuẩn UI, chuẩn dữ liệu, endpoint, template báo cáo hoặc hướng xử lý nào được dùng lặp lại nhiều lần, agent phải đề xuất tách thành Skill để dùng lại lâu dài và tiết kiệm token.

### Khi nào nên tạo Skill

Nên tạo Skill nếu nội dung thuộc một trong các nhóm:

- Quy trình kiểm UI mobile/tablet/PC.
- Quy trình deploy Cloudflare/GitHub.
- Quy chuẩn Product Master.
- Quy chuẩn Finance Core.
- Quy trình Facebook CRM kết nối ShopHuyVan External API.
- Checklist marketplace endpoint Shopee/Lazada/TikTok.
- Quy tắc chat automation.
- Quy tắc xử lý shop có API và shop không API.
- Quy trình debug dữ liệu sai/lệch.
- Template báo cáo sau deploy.
- Checklist test luồng thật sau khi deploy.

### Khi nào không cần tạo Skill

Không tạo Skill cho:

- Việc chỉ dùng một lần.
- Ghi chú quá nhỏ.
- Dữ liệu tạm.
- Token, cookie, mật khẩu, API key.
- Nội dung phụ thuộc vào session đăng nhập.
- Nội dung chưa ổn định hoặc chưa được user chốt.

### Quy trình đề xuất Skill

Khi phát hiện nội dung nên tách Skill, agent phải báo:

1. Tên Skill đề xuất.
2. Dùng để làm gì.
3. Khi nào nên tự động dùng Skill này.
4. Nội dung nào sẽ đưa vào Skill.
5. Nội dung nào vẫn để trong `AGENTS.md`.
6. Có cần tạo file `skill.zip` không.

Không tự tạo Skill nếu chưa báo rõ phạm vi, trừ khi user yêu cầu trực tiếp.

### Nguyên tắc tiết kiệm token

- `AGENTS.md` chỉ giữ quy tắc bắt buộc, ngắn gọn.
- Nội dung dài, checklist chi tiết, ví dụ nhiều, quy trình lặp lại nên đưa vào Skill.
- Skill phải chia theo chủ đề để khi cần mới load, tránh nhồi toàn bộ vào context.
- Không đưa secret/token/cookie/API key vào Skill.

## 17. Quy tắc báo cáo kết quả cuối mỗi lần làm

Sau mỗi lần xử lý xong một cụm tính năng, báo rõ:

- đã làm được những gì
- đang khóa những gì
- shop có API chạy theo cách nào
- shop không có API xử lý theo cách nào
- đã deploy môi trường nào
- đã kiểm tra thật trên mobile/tablet/PC chưa
- còn thiếu endpoint/quyền gì
- bước tiếp theo nên làm gì

Không được chỉ nói “đã xong” chung chung.
