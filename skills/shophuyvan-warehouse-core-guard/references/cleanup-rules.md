# Cleanup Rules

Khi nghiệp vụ đã có Warehouse path thì xoá code cũ liên quan.

Không giữ legacy kéo dài.

## Rule

Nếu xoá gây lỗi, sửa caller sang Warehouse. Không khôi phục legacy trừ khi chưa có replacement production.

## Xoá ngay khi đủ điều kiện

- mock send
- fake success
- UI chat legacy không còn import
- route cũ không còn caller
- formatter duplicate trong frontend
- helper duplicate lấy shop/order/product không qua Warehouse
- docs cũ mô tả luồng sai

## Điều kiện xoá bắt buộc

Chỉ xoá file hoặc helper khi đã kiểm đủ:

- không còn import
- không còn route registration
- không còn HTML/script load
- không còn service binding
- không còn scheduled/local helper gọi
- không còn test phụ thuộc
- không còn request production
- `rg` toàn repo không còn caller

Nếu chưa đủ chắc thì không xoá bừa. Đánh dấu deprecated, chặn route public bằng `410` nếu phù hợp, và ghi vào `docs/PROJECT-CURRENT-STATE.md` mục `Legacy cần audit`.

## Dirty data trong phạm vi Core/Warehouse

Khi sửa dữ liệu phải dry-run trước, có backup/snapshot nếu đụng production, rồi mới cleanup batch nhỏ. Nhóm cần audit gồm duplicate thật, orphan records, stale diagnostic, raw/debug/temp/cache cũ và payload quá nặng không còn cần cho read path.

## Wrapper chỉ được tồn tại khi

Endpoint public production vẫn còn caller.

Wrapper phải:

- validate request
- gọi Warehouse/Core mới
- không chứa business logic
- có comment remove condition rõ ràng
