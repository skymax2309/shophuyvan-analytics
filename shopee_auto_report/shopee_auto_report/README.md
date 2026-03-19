# ShopHuyVan — Tự động tải báo cáo Shopee (Python)

## Cài đặt (1 lần duy nhất)

Mở Command Prompt hoặc Terminal, chạy:
```
pip install selenium webdriver-manager requests
```

## Chạy script

```
python shopee_download.py
```

## Script sẽ làm gì?

```
[1/5] Mở Chrome → vào banhang.shopee.vn/portal/finance/income/statement
[2/5] Chờ bảng báo cáo load xong
[3/5] Tự click nút Download (Shopee bắt đầu xử lý)
[4/5] Chờ 3 phút (hiện đếm ngược)
[5/5] Tự click icon 3 gạch → click Tải về → file lưu về máy
      → Tự upload lên ShopHuyVan
```

## Lưu ý

- Phải đang đăng nhập sẵn vào Shopee Seller, hoặc script sẽ chờ 60s để bạn đăng nhập
- File tải về lưu tại: `~/Downloads/shopee_reports/`
- Xem log màu trong terminal để biết đang chạy đến bước nào

## Tùy chỉnh trong file `shopee_download.py`

```python
DATE_FROM = "2026-02-01"   # Ngày bắt đầu
DATE_TO   = "2026-02-28"   # Ngày kết thúc
HEADLESS  = False           # True = ẩn trình duyệt
```
