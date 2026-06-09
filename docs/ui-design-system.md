# ShopHuyVan UI Design System

Ngày cập nhật: 2026-05-25

Tài liệu này là chuẩn giao diện bắt buộc cho toàn bộ ShopHuyVan. Khi sửa hoặc tạo UI, phải đọc thêm Skill `shophuyvan-ui-design-system-guard` và `docs/ui-production-checklist.md`.

## Nguyên Tắc Thiết Kế

- Người vận hành nhìn vào phải biết ngay trạng thái, vấn đề và hành động tiếp theo.
- UI chỉ hiển thị số liệu, trạng thái, khuyến nghị và hành động; không hiển thị endpoint, payload, route, request id, JSON, Core, guard, cache hoặc raw log.
- Mọi màn hình theo cấu trúc header, filter, summary, main content, detail drawer/modal và loading/empty/error state.
- Mobile first: mobile ưu tiên card/list; tablet dùng compact layout; desktop có thể dùng table đầy đủ.
- Không báo pass nếu giao diện còn tràn ngang, chữ đè chữ, icon đè chữ, nền trắng lệch dark theme, card cắt nội dung hoặc người dùng không biết cần bấm gì.
- Không lạm dụng tooltip hoặc icon chú thích. Nếu icon làm rối bảng/card thì bỏ khỏi màn chính và chỉ giải thích trong drawer/detail khi người dùng bấm xem sâu.

## Màu Sắc

Token chuẩn nằm ở `apps/fe/css/theme/shophuyvan-design-tokens.css`.

| Token | Mục đích |
|---|---|
| `--shv-bg-page` | Nền trang xanh đen đậm |
| `--shv-bg-panel` | Nền panel/sidebar/filter |
| `--shv-bg-card` | Nền card sáng hơn nền |
| `--shv-border` | Border mảnh, vừa tương phản |
| `--shv-text-main` | Text chính sáng, dễ đọc |
| `--shv-text-muted` | Text phụ xám xanh |
| `--shv-primary` | Action chính |
| `--shv-success` | Thành công/đủ dữ liệu |
| `--shv-warning` | Cần kiểm/chờ xử lý |
| `--shv-danger` | Lỗi/nguy hiểm/lãi âm |
| `--shv-info` | Thông tin/phụ trợ |

Không dùng card trắng trong vùng dark theme, trừ khi có thiết kế riêng được chốt.

## Spacing

- Page padding desktop: `24px`.
- Page padding tablet: `16px`.
- Page padding mobile: `12px`.
- Card padding: `16px`.
- Gap giữa card: `12-16px`.
- Border radius: `12-16px`.
- Button height: `36-44px`.
- Input height: `40-44px`.

Không để phần tử dính nhau hoặc quá xa nhau. Không dùng height cố định cho nội dung động.

## Typography

- Page title: lớn, rõ, không quá dài.
- Section title: vừa, rõ.
- Label: nhỏ hơn title nhưng vẫn đọc được.
- Text phụ: xám xanh, không mờ quá.
- Không giảm font-size để né lỗi layout.
- Không đặt đoạn mô tả dài trong card KPI hoặc table cell.

## Card

- Card chỉ chứa một nhóm thông tin rõ ràng.
- Summary card tối đa 4-6 card chính mỗi trang.
- Mỗi summary card có một số chính, một nhãn và một dòng phụ.
- Không nested card nếu không thật cần.
- Không `height` cố định khi nội dung đến từ dữ liệu thật.
- Không để scrollbar nội bộ trong summary card.

## Button

- Primary: hành động chính của trang.
- Secondary: hành động phụ.
- Danger: thao tác nguy hiểm hoặc ghi thật cần cẩn trọng.
- Disabled: nhìn rõ không bấm được, có lý do ngắn nếu cần.
- Button cùng nhóm phải thẳng hàng và cao `36-44px`.

## Badge

- Success: `Đang chạy`, `Thành công`, `Đủ dữ liệu`.
- Warning: `Cần kiểm`, `Sắp hết hàng`, `Chờ xử lý`.
- Danger: `Lỗi`, `Lãi âm`, `Cần dừng`.
- Neutral: `Chưa có dữ liệu`, `Chỉ xem`.

Badge chỉ ghi nhãn nghiệp vụ, không ghi mã kỹ thuật dài.

Badge trong bảng quyết định phải nói vấn đề thật, ví dụ `Không hiệu quả`, `ROAS thấp`, `Lãi âm`, `Thiếu giá vốn`, `Thiếu doanh thu ADS`, `Sắp hết hàng`. Không dùng badge kiểu `Giảm 30%` đứng một mình vì người dùng không biết đó là vấn đề hay hành động. Hành động phải là nút riêng như `Tạm dừng`, `Giảm ngân sách`, `Giữ ADS`, `Bật lại`, `Kiểm giá vốn`.

## Table

- Desktop dùng table đầy đủ.
- Tablet dùng compact table hoặc table có scroll rõ ràng trong khung.
- Mobile chuyển thành card list nếu table làm page tràn ngang.
- Cột hành động phải dễ thấy, không bị che bởi popup/dropdown.
- Không nhồi quá nhiều cột; thông tin sâu đưa vào drawer/modal.
- Cột số tiền, số lượng, tồn kho, ROAS và ACOS phải căn phải, dùng `font-variant-numeric: tabular-nums`.
- Header cột số và cell dữ liệu phải cùng trục; không chen badge hoặc action vào cột số.
- Cột `Vấn đề` và `Hành động` phải tách riêng để row không bị kéo cao bất thường.

## Drawer

- Desktop: drawer bên phải.
- Mobile: panel full screen.
- Drawer chỉ mở khi người dùng cần xem sâu.
- Có nút đóng rõ và không che action chính của trang khi chưa cần.

## Modal

- Dùng cho xác nhận, preview ghi thật hoặc form ngắn.
- Không nhồi toàn bộ dữ liệu vào modal.
- Mobile modal phải full width hoặc full screen để không tràn ngang.
- Danger modal phải ghi rõ hậu quả và action xác nhận.

## Tooltip

- Không đặt icon tooltip trên mọi số liệu. Help icon không phải bắt buộc cho mọi field.
- Nếu tooltip làm rối UI, gây overlap hoặc làm người dùng khó đọc số liệu thì bỏ tooltip khỏi màn chính.
- Icon tooltip nếu còn dùng phải nằm cạnh label, không đè label.
- Desktop/tablet dùng popover cạnh icon.
- Mobile dùng bottom sheet hoặc popup full width.
- Tooltip giải thích nghiệp vụ bằng tiếng Việt ngắn gọn, không ghi endpoint/payload/raw log.

## Responsive

Breakpoint bắt buộc cần kiểm:

- Desktop `1366x900`.
- Tablet `820x1180`.
- Mobile `390x844`.

Pass khi không tràn ngang, không overlap, card không bị cắt, filter dùng được, action chính bấm được, drawer/modal dùng được, loading/empty/error state không vỡ layout.

## Checklist Nghiệm Thu

- Đã đọc `AGENTS.md`, `shophuyvan-ui-end-user-guard`, `shophuyvan-ui-design-system-guard`.
- Đã có layout text trước khi code.
- Dùng token chung, không tự tạo màu lẻ.
- Không có text kỹ thuật trên UI người dùng cuối.
- Có loading, empty, error, success state.
- Chỉ dùng tooltip khi thật cần; không có icon chú thích rải khắp màn chính.
- Bảng số liệu chính căn phải/tabular, badge nói vấn đề thật và action tách riêng.
- Desktop/tablet/mobile đã kiểm production thật.
- Nếu còn UI debt, ghi vào `docs/PROJECT-CURRENT-STATE.md`.

## Ví Dụ Layout Chuẩn

### ADS

- Header: `ADS quảng cáo`, mô tả ngắn, `Làm mới`, `Kéo ADS`, thời gian cập nhật.
- Filter: ngày, sàn, shop, trạng thái, tìm kiếm.
- Summary: Tổng chi ADS, doanh thu ADS, ROAS, SKU cần xử lý, cảnh báo lãi âm.
- Main: tab Tổng quan có `Việc cần làm hôm nay` không scrollbar nội bộ; `Top SKU ưu tiên` và `Sản phẩm cần xử lý` có cột số căn phải, cột `Vấn đề` và `Hành động` riêng.
- Action ADS: `Xem`, `Tạm dừng`, `Giảm ngân sách`, `Giữ ADS`, `Bật lại`; không dùng badge `Giảm 30%` thay cho vấn đề.
- Main tabs: Tổng quan, Sản phẩm cần xử lý, Điều chỉnh ADS, Đồng bộ dữ liệu, Nhật ký thao tác.
- Detail: drawer chiến dịch/SKU, modal preview trước khi áp dụng.
- Empty/error: không có campaign, thiếu quyền API, không tải được dữ liệu.

### Khuyến mãi sàn

- Header: `Khuyến mãi sàn`, mô tả ngắn, `Đồng bộ khuyến mãi`.
- Filter: ngày, sàn, shop, module, trạng thái.
- Summary: chương trình đang chạy, SKU đang giảm giá, sắp hết hàng, chương trình cần kiểm.
- Main: module Shopee/Lazada theo card hoặc table.
- Detail: drawer chương trình, modal preview đổi giá/tạm dừng.
- Empty/error: module chưa có dữ liệu, chỉ xem dữ liệu, thiếu quyền ghi.

### OMS

- Header: `Đơn hàng`, mô tả ngắn, action đồng bộ an toàn.
- Filter: ngày, sàn, shop, trạng thái, loại lỗi vận hành.
- Summary: đơn mới, cần xử lý, thiếu tem, thiếu tài chính, lỗi tracking.
- Main: desktop table, mobile card order.
- Detail: drawer đơn hàng có tab Thông tin, Vận chuyển, Tài chính, Sản phẩm, Chat.
- Empty/error: không có đơn theo bộ lọc, API thiếu quyền, runner cần đăng nhập.

### Product Master

- Header: `Sản phẩm`, mô tả ngắn, action đồng bộ/nhập SKU.
- Filter: sàn, shop, nhóm sản phẩm, trạng thái mapping, tồn kho.
- Summary: tổng SKU, thiếu giá vốn, sắp hết hàng, chưa map.
- Main: table SKU desktop, card SKU mobile.
- Detail: drawer SKU, modal mapping/combo/chỉnh giá.
- Empty/error: chưa có sản phẩm, thiếu dữ liệu Product Core, đồng bộ thất bại.

### Nhập hàng

- Header: `Nhập hàng`, mô tả ngắn, action tạo lô nhập.
- Filter: ngày nhập, nhà cung cấp, trạng thái lô.
- Summary: tổng lô, tổng vốn, SKU chưa khớp, lô cần kiểm.
- Main: danh sách lô nhập và SKU trong lô.
- Detail: drawer lô nhập, modal preview/confirm ghi Purchase Core.
- Empty/error: chưa có lô, SKU không tồn tại trong Product Core, công thức thiếu dữ liệu.

### Chat/CSKH

- Header: `Chat/CSKH`, mô tả ngắn, trạng thái sync/gửi.
- Filter: kênh, shop, chưa đọc, trạng thái xử lý, capability gửi.
- Summary: hội thoại chưa đọc, cần trả lời, gửi lỗi, shop thiếu quyền.
- Main: danh sách hội thoại, khung chat, panel khách/đơn.
- Detail: drawer đơn hàng/ghi chú/tag nếu màn hẹp.
- Empty/error: chưa chọn hội thoại, shop chưa có quyền gửi, sync lỗi, gửi lỗi có nút gửi lại.
### Customer Database Page

- Dùng layout vận hành: header + bộ lọc + 4 chỉ số + danh sách/table responsive.
- Mobile hiển thị card dọc; desktop hiển thị 4 cột: khách hàng, liên hệ, nguồn, trạng thái.
- Số điện thoại có thể mask ở UI; trạng thái Facebook/Zalo chỉ là readiness, không phải live action.
