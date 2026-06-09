---
name: shophuyvan-ui-master-guard
description: >
  Bắt buộc đọc trước khi: 
  (1) thêm hoặc sửa bất kỳ UI component, page, layout, CSS trong hệ thống ShopHuyVan, 
  (2) sửa màu, badge, bảng, form, card, drawer, modal, nút bấm, 
  (3) thêm text/label/trạng thái hiển thị ra màn hình, 
  (4) sửa responsive layout hoặc spacing, 
  (5) sửa loading state,empty state, hoặc error state. Trigger kể cả task nhỏ như đổi màu badge, thêm cột bảng, hoặc sửa padding. Dừng việc nếu không đọc được file này.
---

# 👑 ShopHuyVan UI Master Guard (Bộ Luật Giao Diện Tối Cao)

# ShopHuyVan UI Design System Guard

## 🎯 Mục Tiêu Duy Nhất
Đảm bảo toàn bộ giao diện hệ thống ShopHuyVan đồng bộ 100%, đạt thẩm mỹ tối giản, chuyên nghiệp cao cấp, vận hành mượt mà, chống lỗi hiển thị và chống spam hành động từ người vận hành cuối.

## Gate bắt buộc
- Trước khi báo pass UI phải kiểm đủ desktop/tablet/mobile.
- không lạm dụng tooltip hoặc icon chú thích; thông tin quan trọng phải hiện bằng nhãn và hành động rõ.
- Số liệu trong bảng phải dùng `font-variant-numeric: tabular-nums`.
- Không dùng badge hành động kiểu `Giảm 30%` đứng một mình như một vấn đề vận hành.

---

## 1. 🚫 Kỷ Luật Thông Tin (Strict Anti-Tech)
- **CẤM TUYỆT ĐỐI hiển thị dữ liệu kỹ thuật thô:** Không render lên màn hình các từ: `payload`, `endpoint`, `route`, `request_id`, `cache`, `guard`, `read-model`, `Core`, `raw response`, `JSON`, raw log, hoặc bảng database.
- **CẤM nút "Chi tiết kỹ thuật":** Tránh làm rối người dùng. Nếu cần hiển thị mã định danh, hãy rút gọn dưới dạng nhãn nghiệp vụ (Ví dụ: `Mã thao tác: #1234`).
- **Ngôn ngữ chuẩn nghiệp vụ:** Toàn bộ text phải là tiếng Việt có dấu, ngắn gọn. Dùng nhãn trạng thái thực tế: `Đã áp dụng`, `Thiếu giá vốn`, `Chờ đồng bộ`, `Lãi âm`. Không viết các đoạn giải thích dài dòng trên màn hình chính.
## Quy Chuẩn Typography Chi Tiết

- **Font stack bắt buộc**: `-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif`.
  Không dùng font serif hoặc font system mặc định cho data table.
- **Thứ bậc kích thước cố định**:
  - Tiêu đề trang: `20-22px`, `font-weight: 700`
  - Tiêu đề card/section: `14px`, `font-weight: 600`, `text-transform: uppercase`,
    `letter-spacing: 0.05em`, màu `#64748b`
  - Dữ liệu cốt lõi (số tiền lớn, KPI): `24-32px`, `font-weight: 800`, màu `#ffffff`
  - Body/label thông thường: `14px`, `font-weight: 400`, màu `#e2e8f0`
  - Dữ liệu phụ/ghi chú: `12px`, màu `#64748b`
- **Không mix font-weight**: trong một card chỉ dùng tối đa 2 weight.
  Không có `font-weight: 500` và `600` và `700` trong cùng một component.
  
---

## 2. 🎨 Tiêu Chuẩn Thẩm Mỹ Dark Mode Hệ Thống
- **Bảng màu Token (Bắt buộc tuân thủ):**
  - *Nền trang chính (Background):* Tone xanh đen sâu `#06111f`.
  - *Nền khối thông tin (Card/Panel):* Màu tối cứng cáp `#0a192b` hoặc `#071321`.
  - *Đường viền (Border):* Siêu mảnh `1px solid rgba(148, 163, 184, 0.1)`. Cấm dùng viền trắng thô cứng.
- **Phân cấp thị giác chữ (Typography Hierarchy):**
  - *Dữ liệu cốt lõi (Doanh thu, ROAS, Lãi, Số lượng):* Kích thước lớn, in đậm (`font-weight: 700` hoặc `800`), màu trắng `#ffffff`.
  - *Dữ liệu phụ (Mã SKU, Ghi chú, Thời gian):* Kích thước nhỏ hơn 1-2px, màu xám mờ `#94a3b8` để giảm điều tiết cho mắt.
- **Thẻ trạng thái đổ bóng mờ (Soft Badges):** Cấm dùng màu đặc chói mắt. Phải dùng chữ đậm trên nền trong suốt (Opacity 15%):
  - 🟢 *Tốt / Hoạt động / Thành công:* Chữ `#22c55e`, Nền `rgba(34, 197, 94, 0.15)`.
  - 🔴 *Kém / Lỗi / Tạm dừng / Lài âm:* Chữ `#ef4444`, Nền `rgba(239, 68, 68, 0.15)`.
  - 🟡 *Cảnh báo / Sắp hết hàng / Chờ xử lý:* Chữ `#eab308`, Nền `rgba(234, 179, 8, 0.15)`.
  
  ## Micro-interactions Bắt Buộc

- **Hover hàng bảng**: `background: rgba(255,255,255,0.03)`, `transition: background 150ms ease`.
  Không dùng màu hover quá sáng hoặc không có transition.
- **Hover card**: `transform: translateY(-1px)`, `box-shadow: 0 4px 20px rgba(0,0,0,0.3)`,
  `transition: all 200ms ease`. Không dùng `translateY` quá 2px — trông rẻ.
- **Nút bấm**: `transition: opacity 150ms ease` khi hover (`opacity: 0.85`).
  Không dùng `background-color` khác hẳn khi hover — gây giật.
- **Fade-in khi load data**: `opacity: 0 → 1`, `transform: translateY(4px) → 0`,
  `transition: all 250ms ease`. Áp dụng cho card và bảng khi data load xong.
- **Skeleton animation**: dùng `background: linear-gradient(90deg, #0a192b 25%, #112240 50%, #0a192b 75%)`,
  `background-size: 200% 100%`, `animation: shimmer 1.5s infinite`.

---

## 3. 📝 Quy Chuẩn Form & Cài Đặt Hiện Đại (Modern UX)
- **Cấu trúc Hội thoại (Conversational UI):** Các form thiết lập điều kiện phức tạp (như cài đặt Luật ADS) bắt buộc phải viết theo cấu trúc câu đọc tự nhiên **NẾU (Điều kiện) -> THÌ (Hành động)**.
- **Ô nhập liệu đồng dòng (Inline Inputs):** Các ô input, select box nhỏ phải nằm lọt thỏm ngay bên trong dòng chữ.
  - *ĐÚNG:* `Nếu ROAS thấp hơn [ 3.5 ] thì tự động giảm [ 10% ] ngân sách.`
  - *SAI:* Tách "Ngưỡng ROAS" và "Mức giảm" thành 2 hàng dọc dàn trải, khô khan.
- **Gom cụm bằng Emoji:** Phân chia form thành các Block độc lập có khoảng cách rõ ràng, tiêu đề kèm Emoji trực quan (Ví dụ: `📈 Tăng ngân sách (Campaign tốt)`, `📉 Cắt lỗ (Campaign kém)`).

## Quy Tắc Dùng Màu Ngoài Badge

- **Màu nhấn (Accent)**: chỉ dùng `#3b82f6` (blue-500) cho nút primary, link active,
  border focus. Không dùng màu accent cho decorative element.
- **Gradient cho KPI card**: cho phép `background: linear-gradient(135deg, #0a192b, #0d2137)`.
  Không dùng gradient nhiều màu sắc khác nhau (rainbow gradient) — trông amateur.
- **Màu icon**: icon phải cùng màu với label đi kèm. Không dùng icon màu sắc khác hẳn text cạnh nó.
- **Đường phân cách**: dùng `border-top: 1px solid rgba(148,163,184,0.08)` thay vì `<hr>` hoặc
  `border: 1px solid #333`.
- **Màu số âm/dương nhất quán**: số dương `#22c55e`, số âm `#ef4444` — áp dụng nhất quán toàn hệ thống.
  Không dùng màu đỏ/xanh khác nhau ở các trang khác nhau.
  
---

## 4. 📊 Quy Chuẩn Bảng Dữ Liệu & Bố Cục Trang
- **Quy tắc căn lề dữ liệu (Bắt buộc):**
  - Cột chứa Chữ/Ký tự (Tên sản phẩm, Tên chiến dịch, Tên shop): Căn trái (Left-aligned).
  - Cột chứa Số liệu (Tiền tệ, Phần trăm, Số lượng, ROAS, T tồn): Bắt buộc căn phải (Right-aligned) và sử dụng font chữ `font-variant-numeric: tabular-nums` để các chữ số thẳng hàng theo hàng đơn vị, hàng chục.
- **Cấu trúc trang chuẩn (Từ trên xuống dưới):**
  1. *Header:* Tiêu đề trang rõ ràng, mô tả ngắn 1 dòng, nút hành động chính bên phải.
  2. *Filter bar:* Chỉ hiện bộ lọc chính, bộ lọc nâng cao phải gom gọn lại.
  3. *Summary cards:* Tối đa 4-6 thẻ tóm tắt số liệu tổng quan.
  4. *Main content:* Bảng dữ liệu hoặc danh sách card kèm hiệu ứng hover hàng sáng nhẹ `rgba(255, 255, 255, 0.02)`.
  5. *Detail Drawer/Modal:* Chỉ mở ra từ bên phải (Desktop) hoặc toàn màn hình (Mobile) khi bấm xem sâu, cấm nhồi tất cả lên màn chính.

## Chuẩn Empty State và Error State

- **Empty State cấu trúc**: icon SVG `48px` màu `#334155` + text chính `16px` màu `#94a3b8` +
  text phụ `14px` màu `#475569` + nút action (nếu có). Canh giữa theo chiều dọc container.
- **Text empty state phải cụ thể theo context**:
  - Không được dùng: `"Không có dữ liệu"` hoặc `"No data"`
  - Phải dùng: `"Chưa có đơn nào trong khoảng ngày này"`, `"Chưa có chiến dịch ADS nào đang chạy"`
- **Error State**: icon cảnh báo `#ef4444` + message lỗi nghiệp vụ (không phải HTTP status) +
  nút `"Thử lại"`. Không hiện stack trace hoặc error code thô.
- **Loading Skeleton**: skeleton phải có đúng số hàng/card như khi có data (dùng `Array(5).fill()`).
  Không dùng spinner xoay đứng một mình giữa màn hình.
---

## 5. ⚡ Tối Ưu Tương Tác & An Toàn Hệ Thống (Kỹ Thuật Code)
- **Chống Spam Click (Double-Clicks):** Tất cả các nút hành động gọi API hoặc lưu dữ liệu (`Lưu lại`, `Áp dụng`, `Đồng bộ`) ngay sau khi được click phải lập tức chuyển sang trạng thái `disabled` và đổi text hiển thị thành `"Đang xử lý..."`. Chỉ mở lại nút khi có phản hồi API thành công hoặc thất bại.
- **Trạng thái Đang tải & Trống (Loading & Empty States):** Không để màn hình trắng tinh khi đợi mạng. Phải dùng hiệu ứng Skeleton hoặc hiển thị trạng thái Empty rõ ràng (Ví dụ: một icon rỗng kèm text `"Không tìm thấy chiến dịch nào phù hợp với bộ lọc"`) khi danh sách rỗng.
- **An toàn chống vỡ giao diện (XSS Escaping):** Bắt buộc bọc TẤT CẢ các biến dữ liệu động hiển thị ra HTML bằng hàm thoát ký tự `esc()` (Ví dụ: `${esc(row.product_name)}`). Phòng trường hợp tên sản phẩm hoặc mã SKU kéo từ sàn về chứa các ký tự đặc biệt phá vỡ cấu trúc thẻ HTML.
- **Kỷ luật khoảng cách (Spacing):** Cấm dùng `float` hoặc chèn liên tiếp thẻ `<br>` để căn chỉnh khoảng cách layout. Phải dùng `display: flex` hoặc `display: grid` với thuộc tính `gap`.
  - Padding trang chính: `24px` (Desktop), `16px` (Tablet), `12px` (Mobile).
  - Card padding: `16px` | Gap giữa các card: `12px - 16px`.
  - Border radius: `12px` cho Card, `6px - 8px` cho Button/Input.

## Z-index Layers Chuẩn

- `z-index: 10` — Sticky header bảng
- `z-index: 100` — Dropdown, tooltip
- `z-index: 200` — Sidebar/filter panel
- `z-index: 300` — Drawer (slide từ phải)
- `z-index: 400` — Modal overlay backdrop (`rgba(0,0,0,0.6)`)
- `z-index: 500` — Modal content
- `z-index: 999` — Toast/notification

Không được dùng `z-index: 9999` hoặc số tùy tiện. Không được để drawer bị che bởi sticky header.
---

## 6. 📱 Tiêu Chuẩn Hiển Thị Co Giãn (Responsive)
Mọi đoạn code UI sinh ra bắt buộc phải vượt qua bài kiểm tra hiển thị trên 3 môi trường:
- **Desktop (`1366x900`):** Hiển thị bảng biểu đầy đủ cột dữ liệu.
- **Tablet (`820x1180`):** Bố cục tự động co giãn, bảng dữ liệu chỉ cuộn ngang trong khung được chỉ định, không làm tràn toàn bộ trang.
- **Mobile (`390x844`):** Bảng dữ liệu (Table) phức tạp bắt buộc phải chuyển đổi thành dạng danh sách thẻ (Card list) xếp dọc. Các nút bấm dễ thao tác bằng ngón cái, drawer/modal phóng to toàn màn hình.

---

## 7. ✅ Định Nghĩa Hoàn Thành (Definition Of Done)
Code UI chỉ được coi là hoàn thành (PASS) khi người thực hiện chạy qua danh sách kiểm tra sau:
1. Đã đọc kỹ file skill này.
2. Đã bọc dữ liệu động bằng hàm `esc()`, đã xử lý nút `disabled` khi click.
3. Không có bất kỳ từ ngữ kỹ thuật thô hoặc debug panel nào lộ ra ngoài UI.
4. Đã kiểm tra trực quan trên cả 3 kích thước màn hình (Desktop, Tablet, Mobile) và chụp ảnh/mô tả chứng minh không vỡ layout, không tràn màn hình ngang.
5. Không có màn hình trắng khi load — đã có skeleton hoặc empty state rõ ràng.
6. Tất cả dữ liệu động đã qua `esc()` — không render raw từ sàn trực tiếp vào HTML.
7. Không có từ kỹ thuật thô (`null`, `undefined`, `[object Object]`, `Core`, `payload`) lộ ra UI.
8. Không được báo pass nếu chưa mở Chrome profile `E:\codex-chrome-profiles\shophuyvan-test` và kiểm production thật — test script pass không đủ điều kiện báo pass.
---

## 8. 📋 Báo Cáo Kết Quả Bắt Buộc
Cuối mỗi lượt chỉnh sửa, AI phải xuất báo cáo theo cấu trúc:
- Xác nhận đã đọc hiểu file skill này.
- Liệt kê các Token màu sắc và Layout đã sử dụng.
- Kết quả test giao diện trên Desktop/Tablet/Mobile (Pass/Fail).
- Các phần nợ giao diện (UI debt) cần xử lý tiếp nếu có.

## Anti-patterns Hay Tái Hiện

Những lỗi dưới đây đã xảy ra thật; không được lặp lại:

- **Hiện từ kỹ thuật thô**: render `payload`, `Core`, `read-model`, `endpoint`, `null`, `undefined`,
  `[object Object]` ra màn hình người dùng → vi phạm Section 1.
- **Badge màu đặc chói**: dùng `background: #22c55e` thay vì `rgba(34, 197, 94, 0.15)` → vi phạm
  Section 2. Badge phải dùng nền opacity 15%.
- **Số liệu không tabular-nums**: cột số tiền/số lượng không có `font-variant-numeric: tabular-nums`
  → số không thẳng hàng, khó đọc nhanh.
- **Nút không disabled sau click**: nút `Lưu`/`Đồng bộ`/`Áp dụng` không disable ngay sau click
  → người dùng spam click, gọi API nhiều lần → vi phạm Section 5.
- **Màn hình trắng khi load**: không có skeleton hoặc empty state khi đợi API → vi phạm Section 5.
- **Dữ liệu động không qua `esc()`**: render tên sản phẩm/SKU/ghi chú từ sàn trực tiếp vào HTML
  → XSS risk → vi phạm Section 5.
- **Dùng `float` hoặc `<br>` để căn layout**: → vi phạm Section 5. Chỉ dùng `flex`/`grid` + `gap`.
- **Mobile vẫn dùng bảng ngang**: màn hình `390x844` vẫn render table thay vì card list xếp dọc
  → vi phạm Section 6.
- **Báo pass khi chưa kiểm 3 màn hình**: chạy test script pass nhưng không mở Chrome production
  kiểm desktop/tablet/mobile thật → không được báo pass.
- **Nền trắng native trong form**: input/select dùng nền trắng mặc định thay vì nền tối theo
  design system → vi phạm Section 2.
  
  