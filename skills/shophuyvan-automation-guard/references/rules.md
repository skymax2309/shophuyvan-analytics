# Shophuyvan Automation Rules Reference

---

## 1. Folder boundaries

| Thư mục | Nội dung được phép |
|---|---|
| `E:\shophuyvan-analytics` | `apps/`, `docs/`, `scripts/`, `skills/`, `.github/`, `AGENTS.md`, config, source code, tests, docs |
| `E:\shophuyvan-python-automation\oms_python` | Toàn bộ Python automation code |
| `E:\shophuyvan-python-automation\profiles\browser` | Toàn bộ Chrome profile automation |
| `E:\shophuyvan-runtime` | Logs, screenshots, debug payloads, jobs, queue/status/lock, runner-control files |

**Không được tạo file ở:** root `E:\`, Desktop, Downloads, temp folders, `E:\codex-chrome-profiles`, parallel repo copies.

### Python automation structure

```
oms_python/core/            ← shared code
oms_python/platforms/shopee/<feature>/
oms_python/platforms/lazada/<feature>/
oms_python/platforms/tiktok/<feature>/
oms_python/features/<feature>/   ← shared features
oms_python/ui/              ← desktop UI
```

Không tái tạo legacy folders: `engines/`, `parsers/`, `ui/` ở root.

### Chrome profiles

Profiles được phép:

| Profile | Dùng cho |
|---|---|
| `shophuyvan-runner-tiktok` | TikTok automation `0909128999` |
| `HuyVan_Bot_Data_khogiadungcona` | Shopee no-API `khogiadungcona` |
| `HuyVan_Bot_Data_lazada_kinhdoanhonlinegiasoc` | Lazada — **chỉ đăng nhập/kiểm thủ công** |
| `HuyVan_Bot_Data_Shop1/2/3` | Chưa automation-safe, chưa được map |
| `E:\codex-chrome-profiles\shophuyvan-test` | **Chỉ kiểm UI production thủ công**, không automation |

Mọi job phải resolve profile qua `oms_python/core/automation_profiles.py`. Profile rows phải có đủ: `platform`, `shop_key`, `shop_name`, `automation_allowed`, `chrome_profile_path`, `profile_status`, `last_verified_at`, `source`. Không hardcode, không fallback sang `E:\codex-chrome-profiles`.

---

## 2. File creation rules

Trước khi tạo file: xác định category và location. Nếu không rõ — báo cáo, không tạo folder mới.

Không tạo duplicate: `*_new`, `*_fix`, `*_final`, `*_clean` trừ khi có lý do migration rõ và file cũ sẽ được xóa/deprecated.

---

## 3. Repo hygiene (`E:\shophuyvan-analytics`)

Không giữ trong repo:

- `artifacts/`, `tmp-*`, `*.log`, `*.pid`
- screenshots, payloads, raw HTML/JSON
- Playwright traces/videos, browser profiles
- Wrangler dev log/pid

Chuyển debug output cần thiết sang `E:\shophuyvan-runtime`.

---

## 4. Action types — định nghĩa & yêu cầu field

Mỗi action type là một job riêng biệt. Không merge trong log, queue, report hoặc pass criteria.

### `pull_orders`

Mục đích: pull/list/upsert đơn marketplace vào OMS.

Required fields: order id/sn/no, platform, shop, current status, tracking number, carrier, items, source, last order sync time.

### `refresh_status`

Mục đích: refresh đơn OMS hiện có (không tạo mới).

Required fields: order id/sn/no, latest order status, fulfillment status, tracking number, carrier, tracking status/latest event (nếu có), items, source, last status sync time.

Nếu không parse được → fail với error code cụ thể: `status_parse_failed`, `tracking_parse_failed`, `items_parse_failed`, `selector_timeout`, `order_not_found`, `wrong_shop_context`, `update_failed`, `readback_mismatch`. Không dùng "if available" để bỏ qua field bắt buộc.

### `sync_detail`

Mục đích: sync detail-only fields vào Core/Warehouse.

Required separation: `status_detail`, `tracking_timeline`, `customer`, `items`.

### `sync_finance`

Mục đích: sync finance/settlement vào Finance Core.

Chỉ ghi `actual_income` khi có dòng settlement/actual-income thật. Ngược lại ghi `estimated_income` và `profit_basis`.

### `retry_label`

Mục đích: download/re-download label PDF, update Label Core.

Không được gọi: ship, arrange, confirm, cancel, hủy, giao hàng, sắp xếp vận chuyển. Shop API dùng Open Platform/Worker label document flow. TikTok và Shopee no-API dùng Chrome automation với mapped profile.

### `sync_ads` / `adjust_ads`

Mục đích: đọc/ghi ADS campaign Shopee/Lazada/TikTok.

- Shopee: `edit_manual_product_ads`, `edit_auto_product_ads`; readback bắt buộc `get_product_level_campaign_setting_info`.
- Lazada: chưa mở live-write tự động; log `platform_not_supported_yet`.
- TikTok: read-only; log `read_only_platform`.
- Không ghi `success` khi sàn chưa readback xác nhận.

### `sync_promotion` / `cleanup_promotion`

Mục đích: đọc/ghi/dọn chương trình khuyến mãi.

- Chỉ xóa/kết thúc trên sàn qua endpoint chính thức; backend luôn trả `local_delete=false`.
- Pass chỉ khi readback từ sàn khớp.
- Không xóa dữ liệu lịch sử khỏi Core.

---

## 5. Production Python file map

| Platform | Feature | File |
|---|---|---|
| TikTok | pull_orders | `platforms/tiktok/orders/keodonmoi.py` |
| TikTok | refresh_status | `platforms/tiktok/orders/capnhattrangthai.py` |
| TikTok | sync_detail | `platforms/tiktok/orders/dongbochitiet.py` |
| TikTok | sync_finance | `platforms/tiktok/orders/capnhattaichinh.py` |
| TikTok | retry_label | `platforms/tiktok/orders/taitem.py` |
| TikTok | diagnostics | `platforms/tiktok/orders/kiemtra.py`, `kiemtrareadonly.py` |
| Shopee | pull_orders | `platforms/shopee/orders/keodonmoi.py` |
| Shopee | refresh_status | `platforms/shopee/orders/capnhattrangthai.py` |
| Shopee | sync_detail | `platforms/shopee/orders/dongbochitiet.py` |
| Shopee | sync_finance | `platforms/shopee/orders/capnhattaichinh.py` |
| Shopee | retry_label | `platforms/shopee/orders/taitem.py` |

Historical Excel files (`*_don_hang.py`) không được dùng cho automation buttons.

---

## 6. Business log requirement

Mọi job bắt buộc ghi business summary — không chỉ lifecycle (`queued`, `running`, `completed`):

```
scanned_count, created_count, updated_count, unchanged_count,
skipped_count, failed_count,
per_order: { changed_fields, skip_reason | error_code },
core_readback_ok
```

Thiếu business summary → job chưa pass.

---

## 7. Automation safety — hard limits

**Không bao giờ được dùng:**

- User Chrome profile hoặc profile test production cho automation
- `taskkill chrome.exe` / global Chrome shutdown
- Các action: ship, arrange, confirm, cancel, hủy, giao hàng, handover, refund
- Payment live sync
- Fake completed / fake updated results

Job pass chỉ khi OMS/API readback xác nhận dữ liệu.

---

## 8. Chrome automation requirements

- Phải chạy visible/headful: không `--headless`, không start minimized.
- Log phải ghi `headless=false`.
- Chỉ đóng PID do runner tạo (có ghi trong lock/status); không `taskkill chrome.exe`.
- Lazada API shop: Chrome profile chỉ dùng đăng nhập/kiểm thủ công; production Lazada order/status/tracking/finance/label phải dùng Open Platform/Worker API.
- Shop API không được fallback sang Seller Center Chrome khi đã có endpoint chính thức.

---

## 9. Runtime/log rules

Tất cả logs/debug output → `E:\shophuyvan-runtime`.

Log bắt buộc: job id, run id, action type, platform/shop, profile path, current URL, current step, error code.

Không log: cookies, tokens, passwords, localStorage secrets, full raw HTML, huge payloads.

Giới hạn:

- Rotate logs tại 10 MB
- Debug payloads dưới 2 MB
- Selector-error: lưu snippet, không full HTML
- Screenshots: chỉ cho lỗi hoặc debug task rõ ràng

---

## 10. Cleanup rules

Audit trước, phân loại keep/delete/archive.

Không xóa mù: Chrome profiles, pending/running queue files, current status/control files, unbacked source code, real order/payment/refund data.

---

## 11. Test/report requirements

Trước khi báo done:

- [ ] `python -m py_compile` cho Python files thay đổi
- [ ] Python tests nếu có
- [ ] `node --check` và npm tests khi JS/Worker files thay đổi
- [ ] `git diff --check`
- [ ] Không có file tạo ngoài allowed paths
- [ ] Không có Chrome profile mới ngoài `profiles/browser`
- [ ] OMS readback cho order automation tasks

Final report bắt buộc gồm: changed files, new files, runtime/log paths, Chrome profile path used, tests run, OMS readback result.
