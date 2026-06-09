---
name: shophuyvan-automation-guard
description: Thực thi guardrail automation cho mọi công việc Codex liên quan đến OMS, Python automation, runner Shopee/TikTok/Lazada, ADS/Promotion, browser profiles, runtime files, repo hygiene, phân tách action_type và kiểm tra production. Dùng khi sửa, debug, dọn dẹp, rebuild hoặc rà soát automation shophuyvan, Radar, OMS runner, luồng seller center, gitignore, agents rules hoặc vị trí file.
---

# Shophuyvan Automation Guard

## Quy tắc cốt lõi

Trước khi động vào bất kỳ thứ gì, phải giữ automation đúng ranh giới và có thể kiểm chứng:

| Khu vực | Vị trí |
|---|---|
| Python automation code | `E:\shophuyvan-python-automation\oms_python` |
| Chrome automation profiles | `E:\shophuyvan-python-automation\profiles\browser` |
| Runtime / logs / debug | `E:\shophuyvan-runtime` |
| Web / Worker / docs | `E:\shophuyvan-analytics` |
| Chỉ kiểm UI production thủ công | `E:\codex-chrome-profiles\shophuyvan-test` — **không dùng cho automation** |

Đọc `references/rules.md` bất cứ khi nào task liên quan đến automation, Radar, runner Shopee/TikTok/Lazada, OMS order sync, ADS/Promotion live-write, dọn file hoặc repo hygiene.

---

## Quy trình bắt buộc

1. Xác định khu vực đích: web/worker, Python automation, runtime/logs, hoặc Chrome profile.
2. Đọc file hiện có trước khi sửa. Không tạo runner/parser/helper song song nếu đã có.
3. Nêu rõ các file/hàm sẽ thay đổi.
4. Giữ mọi file mới trong cấu trúc được phép.
5. Chạy các kiểm tra liên quan (xem rules.md §11).
6. Báo cáo có file nào tạo ngoài đường dẫn cho phép không. Nếu có, giải thích lý do.
7. Với lỗi OMS production: phải thao tác màn hình OMS thật và đúng button/luồng sau deploy. Pass code/test/build/log chưa đủ.

---

## Điểm dừng bắt buộc — dừng và báo cáo, không tiếp tục

- Tạo Chrome profile ngoài `E:\shophuyvan-python-automation\profiles\browser`
- Ghi log/screenshot/payload/debug vào `E:\shophuyvan-analytics` hoặc trong Chrome profile
- Tạo automation code ngoài `E:\shophuyvan-python-automation\oms_python`
- Dùng `taskkill chrome.exe`, đóng Chrome người dùng, dùng Chrome profile cá nhân
- Gọi action: ship, arrange, confirm, cancel, hủy, giao hàng, refund, handover
- Báo job thành công khi OMS readback chưa xác nhận dữ liệu
- Job còn `queued` hoặc `running` quá timeout — phải kết thúc `failed` hoặc `runner_timeout` với `last_error` rõ
- Shop Lazada API dùng Chrome cho luồng order/status/tracking/finance/label production (Chrome chỉ dùng đăng nhập/kiểm thủ công)
- Shop API dùng Seller Center Chrome fallback khi endpoint Open Platform đã có hoặc chưa chứng minh là thiếu

---

## Tiêu chuẩn action type

Mỗi action type là một job riêng biệt. Không được gộp chung trong log, queue, report hoặc tiêu chí pass.

| Action | Mục đích | Điều kiện pass |
|---|---|---|
| `pull_orders` | Kéo/upsert đơn marketplace vào OMS | Core readback xác nhận upsert |
| `refresh_status` | Refresh trạng thái/tracking đơn OMS hiện có | Core readback xác nhận update |
| `sync_detail` | Sync status_detail, tracking_timeline, customer, items | Core readback từng phần |
| `sync_finance` | Sync settlement/phí/profit vào Finance Core | Chỉ ghi `actual_income` khi có dòng settlement thật |
| `retry_label` | Download/re-download label PDF | Label Core cập nhật, không gọi ship/arrange/confirm |
| `sync_ads` / `adjust_ads` | Đọc/ghi ADS campaign | Shopee: readback `get_product_level_campaign_setting_info` khớp |
| `sync_promotion` / `cleanup_promotion` | Đọc/ghi/dọn khuyến mãi | Readback từ sàn khớp; backend luôn trả `local_delete=false` |

---

## Yêu cầu business log

Mỗi job bắt buộc ghi business summary — không chỉ lifecycle (`queued`, `running`, `completed`):

```
scanned_count, created_count, updated_count, unchanged_count,
skipped_count, failed_count,
per_order: { changed_fields, skip_reason | error_code },
core_readback_ok
```

Thiếu business summary → job chưa được coi là pass.

---

## Kiến trúc OMS automation

- Python chỉ là runner/parser. Dữ liệu cuối phải ghi vào Core/Warehouse; OMS đọc từ read-model.
- Shop API: dùng endpoint Open Platform chính thức. Không Chrome/Seller Center fallback cho shop API.
- Chuỗi endpoint label Shopee: `get_shipping_document_parameter` → `create_shipping_document` → `get_shipping_document_result` → `download_shipping_document`.
- ADS live-write (Shopee): `edit_manual_product_ads` / `edit_auto_product_ads`; readback bắt buộc `get_product_level_campaign_setting_info`. Lazada: log `platform_not_supported_yet`. TikTok: log `read_only_platform`.
- Dọn khuyến mãi: chỉ xóa/kết thúc qua endpoint chính thức; backend luôn trả `local_delete=false`; không xóa dữ liệu lịch sử khỏi Core.

---

## Yêu cầu Chrome automation

- Phải chạy visible/headful: không `--headless`, không start minimized.
- Log phải ghi `headless=false`.
- Chỉ đóng PID do runner tạo và được ghi trong lock/status. Không `taskkill chrome.exe`.
- Mọi job phải resolve profile qua `oms_python/core/automation_profiles.py`.
- Profile map phải có đủ: `platform`, `shop_key`, `shop_name`, `automation_allowed`, `chrome_profile_path`, `profile_status`, `last_verified_at`, `source`.

---

## Checklist kiểm tra pipeline thật

Automation/Radar/local runner/job queue chỉ được báo pass khi đã kiểm đủ chuỗi:

- [ ] Web/Radar tạo job
- [ ] `/api/jobs` lưu đúng payload
- [ ] Local runner nhận job id và route đúng `action_type`
- [ ] Python/API path được gọi thật
- [ ] Browser automation mở đúng profile khi action cần browser
- [ ] Script ghi log tiến trình với business summary
- [ ] Job kết thúc: `completed`, `completed_no_change`, `failed`, `runner_timeout`, hoặc `runner_requires_login`
- [ ] Core readback xác nhận đúng
- [ ] OMS production hiển thị đúng

---

## Tên file Python production

| Platform | Tên file |
|---|---|
| TikTok | `keodonmoi.py`, `capnhattrangthai.py`, `dongbochitiet.py`, `capnhattaichinh.py`, `taitem.py`; diagnostics: `kiemtra*.py` |
| Shopee | `keodonmoi.py`, `capnhattrangthai.py`, `dongbochitiet.py`, `capnhattaichinh.py`, `taitem.py` |

Không tạo wrapper file chỉ để gọi module cũ. Rename/tách implementation thật, xóa caller thừa sau khi `rg` xác nhận không còn ai dùng.

---

## Quy tắc dọn code

- File/helper automation thừa, không còn caller active trong production/test/docs/job/action → xóa sau khi audit bằng `rg`.
- Caller còn active nhưng đang đi vòng qua Core → route caller ghi/đọc Core trước, rồi xóa đường cũ.

---

## Mặc định an toàn (luôn áp dụng)

- Không sync Payment live.
- Không gọi ship, arrange, confirm, cancel, refund, giao hàng, handover, hủy.
- Chỉ đọc và parse — trừ khi người dùng cho phép rõ ràng một safe write đã được hỗ trợ và có guard.
- `queued` hoặc `running` không bao giờ được tính là pass.
