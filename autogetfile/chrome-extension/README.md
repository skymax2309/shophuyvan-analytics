# ShopHuyVan Auto Report — Chrome Extension

## Cách cài đặt

1. Mở Chrome → vào `chrome://extensions/`
2. Bật **Developer mode** (góc phải trên)
3. Click **Load unpacked**
4. Chọn thư mục `chrome-extension/` này
5. Extension xuất hiện trên thanh toolbar ✅

---

## Cách sử dụng

### Tự động hoàn toàn:
1. Click icon extension trên toolbar
2. Chọn **khoảng ngày** cần tải báo cáo
3. Chọn **sàn** muốn tải (TikTok / Shopee / Lazada)
4. Nhấn **🚀 Bắt đầu tải tự động**
5. Extension sẽ tự mở tab, điều hướng đến trang báo cáo và trigger download
6. File được upload thẳng lên ShopHuyVan

### Auto-intercept download:
- Bật toggle **Auto-intercept download**
- Khi bạn download file báo cáo từ bất kỳ sàn nào, extension sẽ tự upload lên hệ thống

### Tự động theo lịch:
- Bật **Tự động theo lịch**
- Chọn ngày trong tháng muốn chạy (VD: ngày 3 hàng tháng)
- Extension sẽ tự động chạy vào ngày đó, tải báo cáo tháng trước

---

## Lưu ý quan trọng

⚠️ **Bạn phải đang đăng nhập vào tài khoản Seller** của các sàn trước khi chạy

⚠️ **Giao diện các sàn thay đổi thường xuyên** — nếu extension không tìm được nút Export, 
bạn có thể bật **Auto-intercept** và tự click Export, extension sẽ tự upload file

⚠️ **TikTok Seller VN** dùng domain `seller-vn.tiktok.com`, không phải `seller.tiktok.com`

---

## Cấu trúc file

```
chrome-extension/
├── manifest.json       ← Cấu hình extension
├── background.js       ← Service worker (upload, intercept download, alarm)
├── popup.html          ← Giao diện popup
├── popup.js            ← Logic popup
├── content/
│   ├── tiktok.js       ← Auto-click trên TikTok Seller
│   ├── shopee.js       ← Auto-click trên Shopee Seller
│   └── lazada.js       ← Auto-click trên Lazada Seller
└── icons/              ← Icon extension (cần thêm icon16/48/128.png)
```

---

## Thêm icon

Tạo hoặc đặt 3 file PNG vào thư mục `icons/`:
- `icon16.png`  — 16×16px
- `icon48.png`  — 48×48px  
- `icon128.png` — 128×128px

Có thể dùng emoji 🛒 convert sang PNG qua: https://emojipedia.org
