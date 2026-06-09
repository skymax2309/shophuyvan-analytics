# Verification Checklist

## Code checks

- npm test
- node --check các JS sửa
- git diff --check
- scan mojibake
- scan secret/token/cookie/session
- nếu sửa D1/query: snapshot schema/tables/indexes trước, dry-run cleanup, kiểm query plan hoặc proxy metric nếu có
- nếu sửa OMS list: kiểm `/api/orders?limit=50`, `/api/orders?limit=200`, filter chính, `/api/orders/changes` nếu UI dùng, không trả raw payload nặng
- nếu sửa legacy/helper: kiểm route/caller bằng `rg`, guard no `taskkill chrome.exe`, no profile user automation, no ship/arrange/confirm/cancel

## Browser profile

Bắt buộc dùng:

E:\codex-chrome-profiles\shophuyvan-test

Không dùng Chrome default profile.

## Production checks

Nếu sửa Chat/CSKH:

- conversation list load
- shop API hiện tên từ Warehouse
- shop chưa API hiện manual/fallback
- message platform_message_id=2414019124426817905 vẫn 1 row, status sent
- sync Shopee không duplicate
- tab Đơn đọc Warehouse
- SKU/tồn đọc Product Master/Warehouse
- attachment vẫn chặn attachment_bridge_not_ready
- không gửi tin live mới

Nếu sửa UI:

- Desktop 1366x900
- Tablet 820x1180
- Mobile 390x844
