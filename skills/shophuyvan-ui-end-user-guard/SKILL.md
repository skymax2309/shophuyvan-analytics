---
name: shophuyvan-ui-end-user-master-guard
description: Enforce ShopHuyVan end-user UI discipline and master UX/UI aesthetics before creating or editing any operator-facing screens (ADS, OMS, Product Master, Finance, Dashboard, Promotion, Chat). Stop UI work if this skill cannot be read.
---

# ShopHuyVan UI End User Master Guard

## Khi Nào Dùng

Dùng skill này trước khi sửa giao diện người vận hành trong ShopHuyVan, đặc biệt các màn ADS, OMS, Product Master, Finance, Dashboard, Khuyến mãi, Chat/CSKH, Cài đặt và các màn có hành động ghi lên sàn.

## 1. Luật Giao Diện Người Dùng Cuối (Strict Anti-Tech)

Giao diện dành cho người vận hành, không phải giao diện debug kỹ thuật. UI phải trả lời ngay: đang có vấn đề gì, số liệu quan trọng là gì, sản phẩm/campaign nào cần xử lý, lý do là gì, và bấm vào đâu để xử lý.

Không render các chữ kỹ thuật sau trên UI người dùng cuối: `payload`, `endpoint`, `route`, `request_id`, `cache`, `guard`, `read-model`, `Core`, `raw response`, `JSON`.

Không có nút `Chi tiết kỹ thuật`. Không hiện request id dài, response thô, raw log, token, permission raw, table/schema, cache key hoặc debug panel. Nếu cần mã thao tác, dùng nhãn ngắn như `Mã thao tác: #1234`.

## Anti-patterns Hay Tái Hiện

Những lỗi dưới đây đã xảy ra thật trong production; không được lặp lại:

- **`[object Object]` hoặc `undefined` render ra UI**: dữ liệu từ sàn chưa parse đúng hoặc
  không qua `esc()` → vi phạm Section 1 và Section 8. Phải handle null/undefined trước khi render.
- **Mojibake (Â/Ã/áº trên UI)**: dữ liệu UTF-8 bị đọc sai encoding, hoặc response không được
  decode đúng trước khi render → phải dùng `repairMojibake()` ở tầng render text.
- **Badge màu đặc chói**: `background: #22c55e` thay vì `rgba(34, 197, 94, 0.15)` → vi phạm
  Section 2. Mọi badge phải dùng nền opacity 15%.
- **Nút không disable sau click**: người dùng bấm nhiều lần, API bị gọi nhiều lần → vi phạm
  Section 8. Disable ngay sau click đầu tiên, không chờ API trả về.
- **Màn hình trắng khi load**: không có skeleton, không có empty state → vi phạm Section 8.
- **Table tràn ngang toàn trang trên mobile**: không có `overflow-x: auto` trong khung riêng
  hoặc không chuyển sang card list → vi phạm Section 5.
- **Dữ liệu kỹ thuật lộ ra**: `Core`, `payload`, `null`, `read-model`, HTTP status code
  raw hiện trên màn hình người dùng → vi phạm Section 1.
- **Class name chung chung gây xung đột CSS**: dùng `.card`, `.table`, `.badge` không có prefix
  → class bị override bởi page khác. Mọi class phải có prefix theo page/module
  (ví dụ: `.ads-card`, `.oms-badge`, `.finance-table`).
- **Inline style cho layout tĩnh**: dùng `style="margin-left: 16px"` cho element tĩnh thay vì
  class CSS → vi phạm Section 8. Chỉ inline khi giá trị tính toán động.
- **Báo pass khi chưa kiểm 3 màn hình**: test script pass nhưng không mở Chrome production
  thật → không được báo pass. Phải có screenshot hoặc mô tả rõ desktop/tablet/mobile.
## 2. Tiêu Chuẩn Thẩm Mỹ & Trải Nghiệm (UI/UX Aesthetics)

### Triết lý Dark Mode chuyên nghiệp
- **Nền trang chính:** Tone màu xanh đen sâu (`#06111f`).
- **Nền Khối Card/Panel:** Màu tối cứng cáp (`#0a192b` hoặc `#071321`).
- **Đường viền (Borders):** Tuyệt đối không dùng viền trắng hoặc viền quá dày. Chỉ dùng viền siêu mỏng, màu nhạt (`1px solid rgba(148, 163, 184, 0.1)`) để phân tách không gian.
- **Bo góc (Border Radius):** Khối Card/Modal lớn dùng `border-radius: 12px;`. Nút bấm/Input/Tag dùng `border-radius: 6px;` hoặc `8px;`.

### Phân cấp thị giác (Typography & Hierarchy)
- **Thông tin cốt lõi:** Các chỉ số tài chính, ROAS, Doanh thu, Số lượng lớn phải dùng font in đậm (`font-weight: 700` hoặc `800`), kích thước lớn và có màu trắng (`#ffffff`) hoặc màu chủ đạo nổi bật.
- **Thông tin bổ trợ:** Text hướng dẫn, ghi chú, mã SKU, thời gian phải dùng font nhỏ hơn và màu mờ (`#94a3b8`) để giảm bớt sự phân tâm của mắt.

### Trạng thái trực quan (Soft Badges)
Mọi nhãn trạng thái hoặc mức độ hiệu quả (Tốt, Kém, Hoạt động, Tạm dừng) không được dùng màu đặc chói mắt. Phải sử dụng màu nền trong suốt phối chữ đậm:
- 🟢 **Tốt / Hoạt động:** Chữ `#22c55e`, Nền `rgba(34, 197, 94, 0.15)`.
- 🔴 **Kém / Lỗi / Tạm dừng:** Chữ `#ef4444`, Nền `rgba(239, 68, 68, 0.15)`.
- 🟡 **Cảnh báo / Chờ duyệt:** Chữ `#eab308`, Nền `rgba(234, 179, 8, 0.15)`.

### Z-index Layers Chuẩn

Không dùng z-index tùy tiện hoặc `z-index: 9999`. Thứ tự cố định:

- `10` — Sticky header bảng
- `100` — Dropdown, tooltip
- `200` — Sidebar / filter panel
- `300` — Drawer (slide từ phải)
- `400` — Modal backdrop `rgba(0,0,0,0.6)`
- `500` — Modal content
- `999` — Toast / notification

Drawer không được bị che bởi sticky header. Modal backdrop phải che toàn bộ nội dung bên dưới.

## 3. Cấu Trúc Form & Cài Đặt Hiện Đại (Modern Forms)

- **Giao diện hội thoại (Conversational UI):** Các khu vực thiết lập điều kiện tự động hoặc cấu hình phức tạp (như Luật ADS) bắt buộc phải thiết kế theo cấu trúc câu từ tự nhiên **NẾU (Điều kiện) - THÌ (Hành động)**.
- **Inline Inputs:** Các ô nhập dữ liệu, ô lựa chọn (select dropdown) nhỏ phải nằm lọt thỏm ngay bên trong dòng chữ của câu lệnh điều kiện.
  * *Ví dụ đúng:* "Nếu ROAS đạt từ `[ input ]` trở lên thì tự động tăng `[ input ]` % ngân sách."
  * *Ví dụ sai:* Xếp nhãn "Ngưỡng ROAS" và "Mức tăng" thành các ô nhập liệu dạng hàng dọc rời rạc.
- **Gom cụm tính năng (Grouping):** Phải phân chia rõ ràng form thành các Block độc lập có tiêu đề bằng Emoji trực quan (ví dụ: `📈 Tăng ngân sách`, `📉 Cắt lỗ cắt giảm`) thay vì trải dài vô tận.

## 4. Quy Chuẩn Bảng Dữ Liệu & Ngôn Ngữ

- **Ngôn ngữ:** Mọi chữ trên UI phải là tiếng Việt có dấu, ngắn gọn, dễ hiểu với người vận hành. Dùng nhãn nghiệp vụ như `Đã áp dụng`, `Chưa áp dụng được`, `Thiếu giá vốn`. Không dùng block ghi chú dài.
- **Căn lề dữ liệu trong bảng:**
  - Cột chứa Ký tự/Chữ (Tên sản phẩm, Tên chiến dịch, Tên shop): Căn trái (Left-aligned).
  - Cột chứa Số liệu (Doanh thu, Chi phí, Lãi ròng, Tỷ lệ %, Số lượng): Bắt buộc căn phải (Right-aligned) và sử dụng font chữ dạng `tabular-nums` để các hàng thẳng cột theo hàng đơn vị, hàng chục, hàng trăm, giúp người dùng dễ so sánh khi đọc lướt.
- **Hiệu ứng hàng:** Khi di chuột qua (Hover), hàng đó phải sáng nhẹ (`background: rgba(255, 255, 255, 0.02)`) để mắt không bị nhìn lệch dòng.

## 5. Layout Responsive

Ưu tiên mobile-first:
- Mobile: bảng chuyển thành card/list, nút dễ bấm, drawer/modal fullscreen khi cần, không tràn ngang.
- Tablet: bố cục co giãn, filter gọn, table chỉ scroll ngang khi thật cần và có khung rõ.
- Desktop: có thể dùng table đầy đủ, nhưng không dồn mọi thứ vào một màn hình khó đọc.

Tuyệt đối cấm dùng `float` hoặc chèn liên tiếp thẻ `<br>` để căn chỉnh khoảng cách layout. Phải dùng `display: flex` hoặc `display: grid` với thuộc tính `gap`.

## 6. ADS UI Contract

ADS chỉ hiển thị các tab người dùng cuối: Tổng quan, Sản phẩm cần xử lý, Khuyến mãi & ADS, Điều chỉnh ADS, Đồng bộ dữ liệu, Nhật ký thao tác, Cài đặt.

Tab điều chỉnh ADS phải là stepper nghiệp vụ: chọn shop, chọn chiến dịch, chọn thay đổi, xem trước, xác nhận áp dụng. Preview hiển thị nội dung, hiện tại, sau khi áp dụng, thay đổi và cảnh báo dễ hiểu; không hiện dữ liệu thô kỹ thuật.

Nhật ký thao tác chỉ hiển thị thời gian, người thao tác, shop, hành động, đối tượng, kết quả, trạng thái và ghi chú. Chi tiết dòng chỉ hiện trước/sau/kết quả/lỗi dễ hiểu.

## 7. Verification (Định Nghĩa Hoàn Thành)

Sau khi sửa UI phải mở giao diện thật bằng profile đúng, kiểm:
- Desktop `1366x900`, Tablet `820x1180`, Mobile `390x844`.
- Không tràn ngang, không lỗi bố cục, chữ không bị đè hay tràn khỏi nút/card.
- Từng tab/action chính chạy mượt mà hoặc hiển thị thông báo chặn (blocker) rõ ràng cho người dùng.

Nếu sản phẩm thực tế còn lỗi hiển thị hoặc còn chứa yếu tố debug thô, kết quả kiểm tra được tính là CHƯA HOÀN THÀNH.

## 8. Tối Ưu Tương Tác & An Toàn (Interaction & Safety)

- **Trạng Thái Trống & Đang Tải (Empty & Loading States):** Không bao giờ để màn hình trống trơn khi chờ API hoặc khi không có dữ liệu. Phải hiển thị trạng thái `Loading` (ví dụ: text mờ, vô hiệu hóa form) và trạng thái `Empty` rõ ràng (kèm dòng text hướng dẫn như "Chưa có chiến dịch nào phù hợp bộ lọc") khi danh sách rỗng.
- **Chống Spam Click (Prevent Double-Clicks):** Mọi nút bấm có tác vụ thay đổi dữ liệu hoặc gọi API (Lưu, Áp dụng, Đồng bộ) bắt buộc phải chuyển sang trạng thái `disabled` và đổi text (ví dụ: đổi từ "Áp dụng" thành "Đang xử lý...") ngay sau khi click. Chỉ mở lại nút khi API đã trả về kết quả thành công hoặc thất bại.
- **An Toàn Dữ Liệu (XSS & Escaping):** Bắt buộc bọc MỌI biến dữ liệu động hiển thị ra UI bằng hàm `esc()` (ví dụ: sử dụng `${esc(row.product_name)}` thay vì `${row.product_name}`). Việc này là bắt buộc để chống vỡ layout giao diện nếu dữ liệu tên sản phẩm/SKU kéo từ sàn về có chứa thẻ HTML hoặc ký tự đặc biệt.
- **Tối Ưu CSS (No Inline Styles):** Hạn chế tối đa việc nhét CSS inline (`style="..."`) trực tiếp vào thẻ HTML, ngoại trừ các thông số tính toán động (như thanh tiến trình). Bắt buộc phải ưu tiên dùng class và khai báo tập trung trong file `.css`.
### Toast & Kết Quả Hành Động

- Sau mọi action ghi dữ liệu (Lưu, Áp dụng, Đồng bộ, Gửi tin), phải hiện toast thông báo kết quả.
- **Cấu trúc toast**: icon + text nghiệp vụ ngắn + auto-dismiss sau `3000ms`.
  - Thành công: icon ✓ màu `#22c55e` + text như `"Đã lưu cài đặt ADS"`.
  - Thất bại: icon ✗ màu `#ef4444` + text lỗi nghiệp vụ (không phải HTTP status).
  - Cảnh báo: icon ⚠ màu `#eab308` + text như `"Đã áp dụng nhưng 2 shop chưa đồng bộ"`.
- Toast xuất hiện góc dưới phải, `z-index: 999`, không che nút bấm hoặc bảng dữ liệu chính.
- Không dùng `alert()` hoặc `confirm()` native của browser.




## Quick Checklist Trước Khi Báo Pass

- [ ] Không có `[object Object]`, `undefined`, `null`, từ kỹ thuật thô nào render ra UI
- [ ] Không có mojibake (Â/Ã/áº) — đã qua `repairMojibake()` nếu dữ liệu cũ
- [ ] Tất cả biến động đã bọc `esc()` — không render raw từ sàn
- [ ] Mọi badge dùng nền opacity 15% — không màu đặc
- [ ] Mọi nút action disable ngay sau click + đổi text "Đang xử lý..."
- [ ] Có skeleton hoặc empty state rõ với text context cụ thể — không màn hình trắng
- [ ] Mọi class CSS có prefix theo page/module — không dùng tên chung chung
- [ ] Số liệu dùng `font-variant-numeric: tabular-nums` và căn phải
- [ ] Toast hiện sau mọi action ghi dữ liệu — không dùng `alert()` native
- [ ] Z-index theo đúng thứ tự chuẩn — drawer/modal không bị che sai
- [ ] Đã mở Chrome profile `E:\codex-chrome-profiles\shophuyvan-test`, kiểm production thật
- [ ] Desktop `1366x900` ✓ / Tablet `820x1180` ✓ / Mobile `390x844` ✓ — không tràn ngang