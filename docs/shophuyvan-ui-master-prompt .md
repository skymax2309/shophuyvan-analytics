---
name: shophuyvan-ui-master-prompt
version: 2.0
applies-to: MỌI trang trong hệ thống ShopHuyVan
updated: 2026-05-26
---

# 🏛️ ShopHuyVan UI Master Prompt — Bộ Luật Giao Diện Tổng

> Prompt này áp dụng cho **toàn bộ hệ thống**: ADS, Khuyến mãi sàn, OMS, Product Master, Nhập hàng, Chat/CSKH, Báo cáo, Phân quyền, Import, Dashboard và mọi trang mới phát sinh.  
> **Đọc toàn bộ trước khi bắt đầu bất kỳ thao tác UI nào. Không được bỏ qua bất kỳ mục nào.**

---

## 0. TRƯỚC KHI CODE — BẮT BUỘC TRẢ LỜI 4 CÂU HỎI

Trước khi viết một dòng code, phải trả lời rõ:

1. **Người dùng cần làm gì trên trang này?** (mục tiêu nghiệp vụ)
2. **Vấn đề/dữ liệu quan trọng nhất cần nhìn thấy ngay là gì?**
3. **Action chính của trang là gì?** (chỉ 1 primary action)
4. **Có action nào ghi thật lên sàn/hệ thống không?** (nếu có → phải có confirm)

Nếu không trả lời được → dừng lại, hỏi người dùng trước khi code.

---

## 1. THÔNG TIN TUYỆT ĐỐI KHÔNG ĐƯỢC HIỂN THỊ TRÊN UI

Không bao giờ render các từ/dữ liệu sau ra giao diện người dùng cuối:

- `payload`, `endpoint`, `route`, `request_id`, `cache`, `guard`
- `read-model`, `Core`, `raw response`, `JSON`, raw log
- Token xác thực, permission key, schema database, table name
- Nút "Chi tiết kỹ thuật", debug panel, console output

Nếu cần hiển thị mã định danh: dùng nhãn ngắn gọn → `Mã thao tác: #1234`

---

## 2. MÀU SẮC & DARK THEME — TOKEN BẮT BUỘC

```
Nền trang chính:     #06111f   (xanh đen sâu)
Nền card/panel:      #0a192b   hoặc   #071321
Border:              1px solid rgba(148, 163, 184, 0.10)
Border hover:        1px solid rgba(148, 163, 184, 0.20)

Text chính:          #ffffff   font-weight: 700–800
Text phụ/label:      #cbd5e1   font-weight: 400
Text mờ/ghi chú:     #94a3b8   font-size nhỏ hơn 1–2px

Badge Tốt/Chạy:      chữ #22c55e   nền rgba(34,197,94,0.15)
Badge Cảnh báo:      chữ #eab308   nền rgba(234,179,8,0.15)
Badge Lỗi/Nguy:      chữ #ef4444   nền rgba(239,68,68,0.15)
Badge Trung tính:    chữ #94a3b8   nền rgba(148,163,184,0.10)
```

**TUYỆT ĐỐI CẤM:**
- Card trắng trong vùng dark theme
- Badge màu đặc chói (solid green, solid red)
- Viền trắng dày > 1px
- Màu nền #000 thuần

---

## 3. TYPOGRAPHY SCALE — CỐ ĐỊNH, KHÔNG TỰ Ý THAY ĐỔI

```
Số KPI chính:        28–32px   font-weight: 700   color: #ffffff
Tiêu đề trang (h1):  22–24px   font-weight: 700   color: #ffffff
Tiêu đề section:     16–18px   font-weight: 600   color: #ffffff
Label/header bảng:   13px      font-weight: 500   color: #94a3b8
Text thường (body):  14px      font-weight: 400   color: #cbd5e1
Text phụ/ghi chú:    12px      font-weight: 400   color: #94a3b8
Badge/chip:          11–12px   font-weight: 500
```

**TUYỆT ĐỐI CẤM:**
- Giảm font-size để né lỗi layout
- Số KPI cùng size với label mô tả
- Đoạn text dài > 1 dòng trong card KPI

---

## 4. SPACING — KHÔNG ĐƯỢC TỰ Ý THAY ĐỔI

```
Padding trang:       24px (desktop)  16px (tablet)  12px (mobile)
Padding card:        16px
Gap giữa card:       12–16px
Border radius card:  12–16px
Border radius nút:   6–8px
Border radius input: 6–8px
Chiều cao nút:       36–44px
Chiều cao input:     40–44px
Chiều cao row bảng:  max 52px kể cả padding (xem mục 9)
```

**TUYỆT ĐỐI CẤM:**
- `float` hoặc chuỗi `<br>` để căn layout
- Height cố định cho nội dung động
- Phần tử dính sát nhau (gap: 0)
- `position: absolute/fixed` cho panel thông tin đè lên main content

---

## 5. CẤU TRÚC MỌI TRANG — THỨ TỰ BẮT BUỘC

```
1. HEADER
   - Breadcrumb (nếu là sub-page)
   - Tiêu đề trang  +  mô tả ngắn 1 dòng
   - Timestamp cập nhật (góc phải)
   - Action chính (góc phải, xem mục 7)

2. FILTER BAR
   - Chỉ hiện bộ lọc chính (ngày, sàn, shop, trạng thái, tìm kiếm)
   - Bộ lọc nâng cao gom vào "Lọc thêm ▾"
   - Custom dropdown có count (không dùng native <select>)

3. SUMMARY CARDS (tối đa 6 card)
   - Mỗi card: 1 số chính + 1 label + 1 dòng phụ ngắn
   - Card có vấn đề → viền/nền nhẹ màu warning/danger
   - Không hiển thị card KPI khi giá trị = 0 và không actionable

4. TAB NAVIGATION (nếu có)
   - Tối đa 6 tab hiển thị cùng lúc
   - Nếu > 6 module: dùng tab cấp 1 (theo sàn/nhóm) + chip cấp 2
   - "Dọn cũ" / action quản lý → button riêng, không phải tab

5. MAIN CONTENT
   - Desktop: table đầy đủ
   - Tablet: compact table hoặc scroll ngang trong khung
   - Mobile: card list

6. DETAIL DRAWER / MODAL
   - Chỉ mở khi người dùng chủ động click xem sâu
   - Desktop: drawer bên phải
   - Mobile: fullscreen panel

7. LOADING / EMPTY / ERROR STATE
   - Bắt buộc có đủ 4 state: loading, empty, error, success
```

---

## 6. SIDEBAR NAVIGATION

```
Width mở rộng:    200–220px
Width thu gọn:    56–64px (icon only)
Menu item:        1 dòng, truncate với ellipsis nếu dài, tooltip đầy đủ khi hover
Active state:     background rgba(99,102,241,0.15), border-left 3px màu primary
Border phân cách: 1px solid rgba(148,163,184,0.10) — không dùng viền trắng
```

---

## 7. BUTTON — PHÂN CẤP BẮT BUỘC

**Mỗi trang chỉ có 1 PRIMARY button (action chính nhất).**

```
PRIMARY:    Màu solid primary (#2563eb hoặc theo token)
            Dùng cho: Tạo mới, Lưu, Xác nhận
            Vị trí: góc phải header

SECONDARY:  Viền mỏng, background trong suốt
            Dùng cho: Đồng bộ, Làm mới, Xuất file
            Icon + text ngắn

GHOST:      Không viền, không nền
            Dùng cho: Xem, Quay lại, action phụ trong bảng

DANGER:     Màu đỏ (outline hoặc solid tùy mức độ)
            Dùng cho: Xóa, Tạm dừng, Hủy — BẮT BUỘC có confirm modal
            
WARNING:    Màu vàng/cam outline
            Dùng cho: Áp dụng thay đổi lên sàn, Ghi đè dữ liệu thật
            BẮT BUỘC có preview trước + confirm modal

DISABLED:   Nhìn rõ không bấm được, có tooltip giải thích lý do ngắn
```

**Action ghi thật lên sàn/hệ thống (áp giá, tạm dừng campaign, đồng bộ ghi):**
→ KHÔNG ĐƯỢC dùng style PRIMARY xanh bình thường
→ Phải dùng WARNING hoặc DANGER
→ Phải có modal xác nhận hiển thị: "Sẽ thay đổi X trên sàn Y. Xác nhận?"

**Sau khi click bất kỳ action nào gọi API:**
→ Ngay lập tức: `disabled = true` + đổi text thành "Đang xử lý..."
→ Chỉ mở lại sau khi API trả về thành công hoặc thất bại

---

## 8. BADGE — QUY TẮC NỘI DUNG

Badge phải nói **vấn đề thật** bằng ngôn ngữ nghiệp vụ:

```
✅ ĐÚNG:   "Lãi âm"  "ROAS thấp"  "Hết hàng"  "Sắp hết hạn"
            "Thiếu giá vốn"  "Chờ xử lý"  "Cần kiểm"  "Đang chạy"

❌ SAI:    "Giảm 30%"  "ID_ERR_402"  "status: 0"  "null"
            Badge kỹ thuật đứng một mình không giải thích gì
```

Badge cảnh báo tự động theo ngưỡng dữ liệu:
- Tồn kho = 0, đang chạy KM/ADS → badge đỏ "Hết hàng" + nền row nhẹ
- Tồn kho ≤ 5 → badge vàng "Sắp hết"
- Ngày kết thúc ≤ 7 ngày → badge vàng "Còn N ngày"
- Ngày đã qua → badge đỏ "Hết hạn"
- ROAS < ngưỡng → badge đỏ "ROAS thấp"

---

## 9. BẢNG DỮ LIỆU — QUY TẮC BẮT BUỘC

**Căn lề:**
- Cột text (tên, SKU, shop, trạng thái): căn trái
- Cột số (tiền, %, số lượng, ROAS, ACOS): căn phải + `font-variant-numeric: tabular-nums`
- Header cột số: căn phải khớp với data

**Row height:**
- Tối đa 52px kể cả padding
- Nếu có > 2 action trong 1 row → gom từ action thứ 3 vào dropdown `⋯`
- KHÔNG để action button xếp 2 hàng trong cùng 1 row

**Cột action:**
- Tối đa 2 button inline (thường là "Xem" + "⋯")
- Action nguy hiểm (áp giá, tạm dừng, xóa) nằm trong dropdown `⋯`, không phải button nổi

**Cột tên sản phẩm dài:**
- `max-width` + `overflow: hidden` + `text-overflow: ellipsis` + `white-space: nowrap`
- Tooltip đầy đủ khi hover
- Phần variant/phân loại → badge nhỏ inline hoặc cột riêng, không lặp lại trong tên

**Hover row:** `background: rgba(255, 255, 255, 0.02)`

**Sort:** Click header cột số để sort. Hiển thị icon ↑↓.

**Desktop:** table đầy đủ
**Tablet:** table scroll ngang trong khung có `overflow-x: auto`
**Mobile:** chuyển thành card list

---

## 10. SUMMARY CARD — QUY TẮC

- Tối đa **6 card** mỗi trang
- Mỗi card: số chính (28–32px/700) + label (12px/mờ) + dòng phụ (12px/mờ hơn)
- Card có số = 0 và không actionable → ẩn, không hiển thị
- Card có vấn đề (số > 0 cần xử lý) → nền/viền nhẹ màu warning hoặc danger
- Không đặt mô tả dài > 1 dòng trong card KPI
- Không scrollbar nội bộ trong summary card

---

## 11. DRAWER / MODAL

**Drawer:**
- Mở từ bên phải (desktop), fullscreen (mobile)
- Chỉ mở khi người dùng click chủ động
- Có nút đóng rõ ràng (X góc phải)
- Không che action chính của trang

**Modal:**
- Dùng cho: xác nhận action nguy hiểm, preview trước khi ghi, form ngắn
- Không nhồi toàn bộ dữ liệu vào modal
- Modal nguy hiểm (xóa, áp thay đổi): hiển thị rõ hậu quả + button xác nhận màu danger
- Mobile: full width hoặc full screen

**TUYỆT ĐỐI CẤM:**
- `position: fixed` panel thông tin đè lên main content
- Panel float đè lên biểu đồ hoặc bảng

---

## 12. LOADING / EMPTY / ERROR STATE — BẮT BUỘC CÓ ĐỦ

```
LOADING:  Skeleton animation HOẶC spinner + text mờ "Đang tải..."
          Không để màn hình trắng trơn

EMPTY:    Icon trống + text giải thích ngắn + action gợi ý
          Ví dụ: "Không có đơn hàng nào phù hợp bộ lọc" + nút "Xóa bộ lọc"

ERROR:    Icon cảnh báo + mô tả vấn đề ngắn (không lộ raw error)
          + nút "Thử lại" hoặc hướng dẫn tiếp theo

SUCCESS:  Toast notification ngắn (3–5 giây) hoặc badge success inline
          Không hiện modal to chỉ để thông báo thành công
```

---

## 13. FORM & CÀI ĐẶT ĐIỀU KIỆN

Các form thiết lập luật tự động (nếu–thì) phải dùng **Conversational UI**:

```
✅ ĐÚNG:
  "Nếu ROAS thấp hơn [ 3.5 ] thì tự động giảm [ 10% ] ngân sách."

❌ SAI:
  Hàng 1: Ngưỡng ROAS: [___]
  Hàng 2: Mức giảm:    [___]
```

Gom nhóm tính năng bằng tiêu đề emoji:
- `📈 Tăng ngân sách (Campaign tốt)`
- `📉 Cắt lỗ (Campaign kém)`
- `⚠️ Cảnh báo & Thông báo`

---

## 14. RESPONSIVE — KIỂM BẮT BUỘC TRÊN 3 MÀN HÌNH

```
Desktop  1366×900:  Table đầy đủ, filter 1 hàng ngang, drawer bên phải
Tablet    820×1180:  Filter compact, table scroll ngang trong khung, không tràn
Mobile    390×844:   Table → card list, action bấm được bằng ngón cái, drawer fullscreen
```

**PASS khi:**
- Không tràn ngang ở bất kỳ breakpoint nào
- Không có text/icon đè lên nhau
- Card không bị cắt nội dung
- Filter dùng được
- Action chính bấm được
- Loading/empty/error không vỡ layout

**FAIL ngay nếu:**
- Còn tràn ngang
- Tab/button wrap xuống hàng 2 ngoài ý muốn
- Action bị che hoặc overflow
- Chữ đè chữ

---

## 15. AN TOÀN KỸ THUẬT

```
XSS:          Bọc tất cả biến động hiển thị ra HTML bằng esc()
              ${esc(row.product_name)}  —  không dùng ${row.product_name}

CSS:          Không dùng float, không chuỗi <br>
              Dùng display:flex hoặc display:grid với gap

Scrollbar:    Custom scrollbar mỏng, tối màu — không dùng native browser scrollbar thô

Select:       Không dùng native <select> cho danh sách > 10 items
              Dùng custom dropdown có search + count
```

---

## 16. CHECKLIST NGHIỆM THU — PHẢI PASS 100% TRƯỚC KHI BÀN GIAO

### A. Nội dung
- [ ] Không có text kỹ thuật trên UI
- [ ] Badge nói vấn đề thật bằng tiếng Việt
- [ ] Số KPI phân cấp rõ so với label

### B. Layout & Spacing
- [ ] Không tràn ngang ở 3 breakpoint
- [ ] Không overlap, không cắt nội dung
- [ ] Row bảng ≤ 52px, không có double-row action
- [ ] Panel thông tin không float đè lên content
- [ ] Sidebar truncate đúng, không cắt chữ

### C. Action & Safety
- [ ] Chỉ 1 primary button mỗi trang
- [ ] Action ghi thật = WARNING/DANGER style + có confirm modal
- [ ] Button disabled ngay sau click, mở lại sau API response
- [ ] Action nguy hiểm trong dropdown ⋯, không phải button nổi

### D. Data & Badge
- [ ] Cột số căn phải + tabular-nums
- [ ] Tồn kho = 0 đang chạy → badge đỏ "Hết hàng"
- [ ] Ngày sắp hết hạn → badge vàng tự động
- [ ] Card KPI = 0 không actionable → ẩn

### E. State
- [ ] Loading state có
- [ ] Empty state có + hướng dẫn
- [ ] Error state có + nút thử lại
- [ ] Tất cả custom dropdown có search

### F. Responsive
- [ ] Desktop 1366×900: PASS
- [ ] Tablet 820×1180: PASS
- [ ] Mobile 390×844: PASS

---

## 17. BÁO CÁO BẮT BUỘC SAU MỖI LẦN SỬA UI

Cuối mỗi lượt chỉnh sửa, xuất báo cáo theo cấu trúc:

```
✅ Đã áp dụng:
   - [liệt kê các rule đã tuân thủ]

🔧 Đã sửa:
   - [liệt kê vấn đề đã fix trong lượt này]

📱 Responsive:
   - Desktop 1366×900: PASS / FAIL
   - Tablet  820×1180: PASS / FAIL
   - Mobile  390×844:  PASS / FAIL

⚠️ UI Debt còn lại (nếu có):
   - [liệt kê vấn đề chưa xử lý và lý do]
```

---

*ShopHuyVan UI Master Prompt v2.0 — áp dụng cho toàn hệ thống*

## 18. SETTINGS PANEL — QUY TẮC CHUNG CHO MỌI LOẠI CÀI ĐẶT

Áp dụng cho: ADS, Chat/CSKH, Nhập hàng, Phân quyền, Product, Shop, Import, 
và mọi panel/drawer cài đặt phát sinh sau này.
### A. GIẢI PHẪU PANEL — THỨ TỰ BẮT BUỘC

TAB NGỮ CẢNH (nếu panel phục vụ nhiều đối tượng)
Ví dụ: Đơn | Sản phẩm | Voucher  /  Shopee | Lazada | TikTok
→ Tối đa 5 tab, không wrap xuống hàng 2
→ Tab này trả lời: "Đang xem cài đặt cho CÁI GÌ?"
TAB NHÓM CHỨC NĂNG
Ví dụ: Cài đặt | Lịch sử | Chẩn đoán  /  Cơ bản | Nâng cao | Phân quyền
→ Tối đa 4 tab
→ Tab này trả lời: "Đang chỉnh phần NÀO của cài đặt?"
→ Nếu chỉ có 1 nhóm chức năng: bỏ lớp tab này, dùng section label thay thế
PANEL BODY (scroll độc lập, không kéo cả trang)
→ Chia thành các SECTION, mỗi section có label rõ ràng (xem mục C)
→ Padding 12px, gap giữa section 16px
→ Custom scrollbar mỏng tối màu
FOOTER SAVE (cố định dưới cùng, không scroll cùng body)
→ Luôn hiển thị, không ẩn khi scroll
→ Chỉ có: [Hủy thay đổi] + [Lưu cài đặt] — không thêm button khác
→ Khi chưa có thay đổi: nút Lưu disabled + mờ
→ Khi có thay đổi chưa lưu: hiện dấu ● hoặc badge "Chưa lưu" cạnh nút


---

### B. KÍCH THƯỚC & VỊ TRÍ
Panel cố định bên phải:   width 260–320px, không co nhỏ hơn 260px
Drawer tạm thời:          width 360–480px, có overlay mờ phía sau, nút X đóng
Panel nổi (popover):      width 280–340px, shadow nhẹ, đóng khi click ra ngoài
TUYỆT ĐỐI CẤM:

Panel đè lên action chính của trang
Panel không có cách đóng/thu gọn rõ ràng
Width thay đổi theo nội dung (phải cố định)
Body panel không scroll độc lập (phải overflow-y: auto riêng)


---

### C. SECTION LABEL — CÁCH GOM NHÓM TRONG PANEL

Mỗi nhóm cài đặt phải có label phân cách rõ ràng:
✅ ĐÚNG:
[icon] TÊN NHÓM                    ← 11px, uppercase, #94a3b8, icon Tabler
────────────────────────────────    ← divider 1px rgba(148,163,184,0.10)
[nội dung cài đặt của nhóm]
Ví dụ thực tế:
🔗 KẾT NỐI & XÁC THỰC
⚙️ CẤU HÌNH CHUNG
🛡️ QUYỀN HẠN & GIỚI HẠN
📋 LUẬT & ĐIỀU KIỆN
🚫 DANH SÁCH CHẶN / TỪ KHÓA
📊 NGƯỠNG & CẢNH BÁO
🔔 THÔNG BÁO
❌ SAI:

Đổ tất cả cài đặt thành 1 khối dài không có section
Dùng màu nền đậm để phân nhóm thay vì label
Section label > 4 từ


---

### D. CÁC PATTERN FORM TRONG PANEL

**Toggle (bật/tắt tính năng):**
[Tên tính năng ngắn gọn]          [toggle]
[Mô tả 1 dòng nếu cần — 12px mờ]

Label tối đa 5 từ
Mô tả phụ chỉ khi tính năng không tự giải thích được
Toggle ON = màu primary, OFF = xám
Khi toggle ảnh hưởng đến sàn thật → sau khi bật hiện confirm nhỏ inline


**Select / Dropdown trong panel:**

Dùng native <select> được nếu ≤ 8 lựa chọn
Từ 9 lựa chọn trở lên → custom dropdown có search
Label ngắn đặt trên hoặc inline trái, không dùng placeholder làm label
Hiển thị giá trị hiện tại rõ ràng, không để trống


**Input số / ngưỡng:**

Luôn kèm đơn vị (%, VNĐ, ngày, lần...) ngay cạnh ô input
Có min/max validation, báo lỗi inline ngay dưới ô — không dùng alert()
Conversational style cho luật nếu–thì (xem §13)


**Trạng thái kết nối dịch vụ ngoài (API key, OAuth, Webhook...):**
┌─────────────────────────────────────┐
│ [Logo/Icon]  Tên dịch vụ            │
│              ••••••••••abc123        │  ← key che bớt
│                         [Cập nhật]  │
│ Badge: Đang hoạt động / Chưa xác thực / Lỗi kết nối │
└─────────────────────────────────────┘

Badge dùng màu theo §2: xanh/vàng/đỏ
Không hiện raw key, không hiện endpoint URL
Nút test kết nối → "Kiểm tra" (secondary), không phải "Test"
Sau khi test: hiện kết quả inline (không dùng alert)


---

### E. PATTERN QUẢN LÝ DANH SÁCH (List Manager)

Dùng cho mọi loại danh sách trong panel: từ khóa chặn, email nhận báo cáo, 
số điện thoại, IP cho phép, tag sản phẩm, tài khoản phụ, v.v.
┌─────────────────────────────────────┐
│ 🔍 [Tìm trong danh sách...]  [N mục]│  ← search + count badge
├─────────────────────────────────────┤
│ item 1               [nguồn] [✕]    │
│ item 2               [nguồn] [✕]    │
│ item 3               [nguồn] [✕]    │  ← max-height, scroll độc lập
├─────────────────────────────────────┤
│ [+ Nhập mục mới...        ] [Thêm]  │  ← add row cố định dưới
└─────────────────────────────────────┘
QUY TẮC:

Count badge luôn hiện số thực tế sau filter
[✕] xóa từng mục: không cần confirm nếu có thể undo, cần confirm nếu không
Thêm mới: validate trùng lặp ngay lập tức, báo lỗi inline
Empty state: icon + "Chưa có mục nào" + gợi ý thêm đầu tiên
Nếu danh sách > 50 mục: phân trang hoặc lazy load, không render hết 1 lúc
[nguồn] là badge nhỏ cho biết mục được tạo từ đâu (thủ công / import / hệ thống)
→ Mục do hệ thống tạo: không có nút [✕], tooltip "Không thể xóa mục hệ thống"


---

### F. TRẠNG THÁI CHƯA LƯU (UNSAVED STATE)
Khi người dùng thay đổi bất kỳ field nào mà chưa lưu:

Nút [Lưu] chuyển từ disabled → enabled
Hiện dấu ● (màu vàng) cạnh tên tab hoặc tiêu đề panel
Nếu người dùng cố đóng panel / chuyển tab: hiện confirm
"Bạn có thay đổi chưa lưu. Lưu trước khi rời?"
[Bỏ thay đổi]  [Quay lại chỉnh]  [Lưu ngay]

TUYỆT ĐỐI CẤM:

Tự động lưu ngầm mà không thông báo (trừ khi có toggle "Tự động lưu" được bật)
Mất thay đổi không cảnh báo khi đóng panel
Nút Lưu luôn enabled kể cả khi không có gì thay đổi


---

### G. BỔ SUNG VÀO CHECKLIST §16
G. Settings Panel

 Panel có đủ 2 lớp tab (ngữ cảnh + chức năng) hoặc đã bỏ lớp không cần
 Mỗi section trong panel có label rõ ràng (icon + tên nhóm)
 Footer Save cố định, disabled khi không có thay đổi
 Unsaved state: hiện dấu ●, có confirm khi thoát
 List manager có search + count + empty state + validate trùng
 Trạng thái kết nối dịch vụ ngoài không lộ raw key / endpoint
 Panel body scroll độc lập, không kéo cả trang
 Width panel cố định, không co giãn theo nội dung