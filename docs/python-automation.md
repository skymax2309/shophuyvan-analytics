# Python automation local

Python automation local đã tách khỏi repo web/worker chính để tránh commit nhầm log, profile Chrome, PDF, XLSX và cache runtime.

## Đường dẫn chuẩn

- Repo chính: `E:\shophuyvan-analytics`
- Python automation: `E:\shophuyvan-python-automation`
- Runtime/log/cache: `E:\shophuyvan-runtime`

## Biến môi trường

- `SHOPHUYVAN_PYTHON_AUTOMATION_DIR`: mặc định `E:\shophuyvan-python-automation`
- `SHOPHUYVAN_RUNTIME_DIR`: mặc định `E:\shophuyvan-runtime`

Các script trong repo chính phải đọc hai biến này trước, không trỏ cứng về `auto OMS Python` trong repo.

## Script vận hành còn giữ trong repo

- `scripts/ensure-oms-radar.ps1`: mở local helper và radar từ thư mục Python automation mới, log vào runtime.
- `scripts/start-telegram-control.ps1`: mở Telegram control bot từ thư mục Python automation mới, log vào runtime.

Không lưu token, cookie, OTP, profile Chrome, PDF, XLSX hoặc cache thật trong repo chính.
