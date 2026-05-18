# UI Responsive Audit

- Ngày kiểm: 2026-05-15
- Màn hình: `apps/fe/pages/ads.html`
- Phạm vi: ADS, Guard ADS, TopPicks, Discount, Khuyến mãi sàn, modal xác nhận, error/result panel, toggle ADS.
- Cách chạy: static server local `http://127.0.0.1:4173/pages/ads.html`, Chrome headless CDP, chặn riêng `/api/admin/auth/me` bằng user admin kiểm thử để mở UI local. Không dùng kết quả này để xác nhận mutation Shopee live.

## Kết quả viewport

| Viewport | Subpage đã mở | Overflow ngang | Lỗi font tiếng Việt | Component kiểm tra | Screenshot |
| --- | --- | --- | --- | --- | --- |
| 360px | overview, guard, top-picks, discount, promotion | Không | Không | `ConfirmActionModal`, `ApiErrorPanel`, toggle switch | `tmp-ads-responsive/ads-360.png` |
| 390px | overview, guard, top-picks, discount, promotion | Không | Không | `ConfirmActionModal`, `ApiErrorPanel`, toggle switch | `tmp-ads-responsive/ads-390.png` |
| 768px | overview, guard, top-picks, discount, promotion | Không | Không | `ConfirmActionModal`, `ApiErrorPanel`, toggle switch | `tmp-ads-responsive/ads-768.png` |
| 1024px | overview, guard, top-picks, discount, promotion | Không | Không | `ConfirmActionModal`, `ApiErrorPanel`, toggle switch | `tmp-ads-responsive/ads-1024.png` |
| 1440px | overview, guard, top-picks, discount, promotion | Không | Không | `ConfirmActionModal`, `ApiErrorPanel`, toggle switch | `tmp-ads-responsive/ads-1440.png` |

## Lỗi đã sửa

- Thanh `ads-datebar` trước đó ép 3 cột từ 760px, gây overflow ở 768px và 1024px. Đã đổi tablet/laptop hẹp sang 2 cột co giãn, chỉ mở lại 3 cột từ 1200px.
- Các hộp thoại `window.alert()` và `window.confirm()` trong cụm ADS/promotion đã thay bằng toast + modal xác nhận trong UI.
- Kết quả Shopee mutation dùng `ApiErrorPanel`/`VerifyResultPanel` thống nhất, có endpoint, action, shop, object_id, request_id, payload/response đã che secret.
- ADS status đổi sang switch/toggle xanh/xám; UI chỉ reload trạng thái sau khi backend trả kết quả đã verify.

## Kiểm tra kỹ thuật

- `node scripts/check-code-size.mjs`: pass, không có code file vượt 30KB.
- `node scripts/check-fe-separation.mjs`: pass; còn cảnh báo inline style nhỏ ở nhiều page legacy, không phải lỗi phát sinh riêng từ phase này.
- `rg "alert\\(|window\\.alert|confirm\\(" apps/fe/js/dashboard/ads apps/fe/js/dashboard/ads.js apps/fe/pages/ads.html`: không còn kết quả.
- Quét các marker mojibake phổ biến trong file ADS/worker/report đã chỉnh: không còn kết quả.

## Ghi chú còn lại

- `apps/fe/js/dashboard/ads/ads-promotion-browser-detail.js` còn 29.4KB, dưới ngưỡng 30KB nhưng nằm trong nhóm cần theo dõi trước lần mở rộng tiếp theo.
- Kiểm responsive trên production cần chạy lại sau deploy. Lần local này xác nhận layout và font của code mới, chưa thay thế live UI verification sau deploy.
