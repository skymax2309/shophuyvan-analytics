---
name: shophuyvan-ads-core-guard
description: |
  Bắt buộc dùng skill này trước khi chạm vào BẤT KỲ code nào liên quan đến ADS trong E:\shophuyvan-analytics.
  Trigger khi: sửa giao diện ADS dashboard, kéo/đồng bộ dữ liệu quảng cáo, tính ROAS/ACOS/lãi sau ADS,
  đưa ra khuyến nghị tăng/giảm/tắt ADS, gọi Shopee Ads API / Lazada Sponsored Solutions / TikTok ADS,
  thay đổi campaign/adgroup/bid/budget/keyword, xem/ghi ads_action_logs, hoặc bất kỳ thứ gì liên quan đến
  automation ADS, cron ADS, luật tự động, khung giờ chạy ADS, dry_run, evaluation engine, executor ADS.
  Nếu task có chữ "ADS", "quảng cáo", "campaign", "adgroup", "bid", "ROAS", "ACOS",
  "automation", "tự động", "cron", "khung giờ", "dry_run", "evaluation", "executor" → dùng ngay.
---

# ShopHuyVan ADS Core Guard

## Nguyên Tắc Không Được Vi Phạm

| Luật | Nội dung |
|------|----------|
| **Single Source** | Mọi dữ liệu ADS phải đi qua ADS Core → read-model → UI. UI không tự tính bất cứ thứ gì. |
| **No Fake Zero** | `0` = dữ liệu thật. `null` = thiếu dữ liệu. Không ép `null` → `0` để làm đẹp dashboard. |
| **Endpoint First** | Shop có API chính thức → phải dùng API. Chỉ dùng Seller Center/browser khi chứng minh được endpoint không tồn tại. |
| **No Hardcode** | Không hard-code shop, campaign, adgroup, product, keyword, ID, ngưỡng ROAS/ACOS. Mọi thứ lấy từ ADS Core / ads_automation_settings. |
| **No Silent Success** | API thành công + readback không khớp → status = `sàn_chưa_xác_nhận`. Không báo thành công. |
| **No Fake Platform** | Lazada executor chưa sẵn sàng → status = `platform_not_supported_yet`. TikTok ADS write → status = `read_only_platform`. Không fake success. |
| **Automation Log** | Mọi action do cron tạo ra phải có `created_by = "automation_cron"`. Action thủ công phải có `created_by = "manual:<user_id>"`. Không để trống hoặc lẫn lộn. |
| **No Heavy Route** | Route mở màn hình không gom enrichment nặng mặc định. Worker 1102 đã xảy ra. Enrichment chỉ chạy khi opt-in. |

---

## ADS Core Data Contract

> UI chỉ được đọc read-model. Raw payload, endpoint, request_id, response thô chỉ lưu backend — không render ra UI.

### Các bảng dữ liệu chuẩn

**`ads_campaigns`** — platform, shop_key, campaign_id, campaign_name, campaign_type, status, budget, daily_budget, roas_target, start_time, end_time, source, last_synced_at, raw_payload

**`ads_adgroups`** — platform, shop_key, campaign_id, adgroup_id, adgroup_name, status, budget, bid_price, roas_target, source, last_synced_at, raw_payload

**`ads_product_links`** — platform, shop_key, campaign_id, adgroup_id, item_id, model_id, sku_id, seller_sku, internal_sku, product_name, source, match_status

**`ads_daily_metrics`** — date, platform, shop_key, campaign_id, adgroup_id, sku_id, spend, impressions, clicks, orders, ads_revenue, ctr, cpc, roas, acos, source, last_synced_at

**`ads_decision_read_model`** — sku_id, product_name, image_url, current_stock, current_cost, spend, ads_revenue, profit_after_ads, roas, acos, recommendation, recommendation_reason, data_status, action_status

**`ads_write_capabilities`** — platform, shop_key, action, endpoint, allowed, requires_admin_confirm, requires_preview, requires_readback, capability_status, last_verified_at

**`ads_action_logs`** — action_id, platform, shop_key, action_type, target_type, campaign_id, adgroup_id, sku_id, before_payload, proposed_payload, write_payload, response_payload, readback_payload, user_facing_result, status, error_code, error_message, created_by, created_at, applied_at, readback_at

**`ads_automation_settings`** — shop_key, auto_enabled (0/1), dry_run_mode (0/1, mặc định 1), time_windows (JSON array), roas_target (REAL), roas_min (REAL), acos_max (REAL), stock_min (INTEGER), budget_max (REAL), max_campaigns_per_run (INTEGER, mặc định 10), max_budget_increase_pct (REAL, mặc định 30.0), max_budget_decrease_pct (REAL, mặc định 30.0), require_admin_confirm_above_pct (REAL, mặc định 50.0), emergency_stop (0/1), last_run_at, last_run_summary (JSON), updated_at

> `time_windows` format: `[{"days": [1,2,3,4,5], "start_hour": 7, "end_hour": 22}]`
> `days`: 0=CN, 1=T2...6=T7. `start_hour`/`end_hour` theo UTC+7.

### Phụ thuộc dữ liệu
ADS Core phải đọc từ các Core khác — không tự tạo nguồn riêng:
- **Product Core** → thông tin sản phẩm, SKU
- **Warehouse Core** → tồn kho hiện tại
- **Finance Core** → giá vốn, doanh thu, lãi
- **Promotion Core** → khuyến mãi đang chạy

---

## Bảng Status Chuẩn (Không Được Dùng String Khác)

| Status | Dùng khi |
|--------|----------|
| `success` | API thành công + readback khớp |
| `sàn_chưa_xác_nhận` | API thành công + readback KHÔNG khớp |
| `dry_run` | dry_run_mode = 1 — không gửi API, chỉ log đề xuất |
| `skipped` | Bị chặn bởi time_window, emergency_stop, hoặc không đủ điều kiện |
| `blocked` | Thiếu mapping, thiếu quyền, thiếu preview, thiếu readback plan |
| `capability_blocked` | ads_write_capabilities.allowed = false |
| `pending_admin_confirm` | requires_admin_confirm = true — queue chờ duyệt |
| `approved_by_admin` | Admin đã duyệt pending_admin_confirm |
| `rejected_by_admin` | Admin từ chối pending_admin_confirm |
| `platform_not_supported_yet` | Lazada executor chưa có — ghi log, KHÔNG fake |
| `read_only_platform` | TikTok ADS — ghi log, KHÔNG fake |
| `error` | Lỗi kỹ thuật khi gọi API (có error_code, error_message) |

---

## Endpoint Allowlist

| Platform | Shop | Trạng thái Live-Write |
|----------|------|----------------------|
| Shopee | `chihuy1984`, `chihuy2309`, `phambich2312` | ✓ Đầy đủ: manual + auto product ads |
| Lazada | `kinhdoanhonlinegiasoc@gmail.com` | ⚠ Executor automation chưa sẵn sàng — ghi `platform_not_supported_yet` |
| TikTok | — | ✗ Read-only. Ghi `read_only_platform`. UI hiển thị `Chỉ xem dữ liệu`. |

**Endpoint Shopee ADS đã live-write production:**
- `edit_manual_product_ads` — pause/resume/budget manual product ads ✓
- `edit_auto_product_ads` — auto bid campaign
- `edit_manual_product_ad_keywords` — keyword write
- Readback: `get_product_level_campaign_setting_info` ✓

**Quy trình khi thiếu endpoint:**
1. Tra Shopee Open Platform / Lazada Open Platform trước khi kết luận thiếu.
2. Endpoint tồn tại → thêm allowlist, adapter, preview, live-write, readback, log, Core writeback.
3. Endpoint có nhưng thiếu quyền/token → ghi `api_permission_missing` hoặc `token_scope_missing`.
4. Endpoint không tồn tại (sau khi kiểm docs) → ghi `endpoint_not_available`.

---

## Live-Write Pipeline

### Pipeline Thủ Công (10 Bước — Bắt Buộc Đủ)

```
1. Sync dữ liệu mới nhất từ sàn
2. Chọn shop/campaign/adgroup từ ADS Core
3. Preview thay đổi (chưa ghi sàn)
4. Kiểm capability + endpoint allowlist
5. Admin confirm (luôn bắt buộc với thủ công)
6. Gọi API live-write
7. Readback từ sàn
8. Ghi ads_action_logs (created_by = "manual:<user_id>")
9. Cập nhật ADS Core + read-model
10. Kiểm production UI
```

### Pipeline Automation / Cron (Khác Thủ Công — Đọc Kỹ)

```
1. Cron trigger (mỗi 15 phút)
2. Đọc ads_automation_settings theo từng shop
3. CHẶN nếu: auto_enabled = 0 → skipped
4. CHẶN nếu: giờ hiện tại (UTC+7) ngoài time_windows → skipped
5. CHẶN nếu: emergency_stop = 1 → skipped
6. Nếu dry_run_mode = 1 → chạy đánh giá đầy đủ nhưng KHÔNG gọi API sàn
7. Gọi Evaluation Engine (7 ngày metrics, ngưỡng từ settings)
8. Với mỗi campaign có proposed_action:
   a. Nếu requires_admin_confirm = true → status = "pending_admin_confirm", DỪNG campaign này
   b. Kiểm capability → status = "capability_blocked" nếu không được phép
   c. Nếu dry_run_mode = 1 → ghi log status = "dry_run", KHÔNG gọi API
   d. Gọi API live-write
   e. Readback từ sàn
   f. So sánh readback → "success" hoặc "sàn_chưa_xác_nhận"
9. Ghi ads_action_logs (created_by = "automation_cron")
10. Cập nhật ads_decision_read_model nếu success
11. Ghi last_run_summary vào ads_automation_settings
```

**Chặn gửi live-write nếu (cả thủ công lẫn tự động):**
thiếu mapping | thiếu quyền | chưa preview (thủ công) | chưa confirm (thủ công) | chưa có readback plan | emergency_stop (tự động) | ngoài time_window (tự động) | dry_run_mode (tự động)

---

## Evaluation Engine — Bảng Phân Loại (Theo Thứ Tự Ưu Tiên)

| Điều kiện (kiểm từ trên xuống) | Classification | Action đề xuất |
|---|---|---|
| `current_cost = null` | `thiếu_dữ_liệu` | `no_action` — "Chưa có giá vốn" |
| Dữ liệu < 3 ngày trong 7 ngày gần nhất | `thiếu_dữ_liệu` | `no_action` — "Chưa đủ dữ liệu 3 ngày" |
| `current_stock < stock_min` | `không_hiệu_quả` | `pause` — "Tồn kho thấp" |
| `roas < roas_min` VÀ `profit_after_ads < 0` | `không_hiệu_quả` | `pause` hoặc `decrease_budget` |
| `acos > acos_max` VÀ chi vượt budget ngày | `không_hiệu_quả` | `decrease_budget` |
| `roas > roas_target × 1.3` VÀ `stock ≥ stock_min × 2` | `hiệu_quả` | `increase_budget` |
| Campaign đang pause + ROAS 7 ngày tốt + tồn đủ | `hiệu_quả` | `resume` |
| `roas` trong `[roas_target × 0.8 → roas_target × 1.3]` | `trung_bình` | `no_action` |

> Mọi ngưỡng (roas_min, roas_target, acos_max, stock_min, budget_max) đọc từ `ads_automation_settings` của từng shop — KHÔNG hardcode.
> Cửa sổ đánh giá chuẩn: **7 ngày gần nhất** từ `ads_daily_metrics`.

**Safety guards bắt buộc trong Evaluation Engine:**
- Đếm action khác `no_action` trong 1 lần chạy: nếu > `max_campaigns_per_run` → chỉ giữ N ưu tiên cao nhất, còn lại → `no_action`, reason = "giới hạn lần chạy"
- `increase_budget`: `after_value = before_value × (1 + max_budget_increase_pct/100)`, cap tại `budget_max`
- `decrease_budget`: `after_value = before_value × (1 - max_budget_decrease_pct/100)`
- Thay đổi % > `require_admin_confirm_above_pct` → `requires_admin_confirm = true`
- Không propose `pause` nếu campaign đang pause; không propose `resume` nếu campaign đang chạy

---

## Checklist Trước Khi Báo Xong

### Code
- [ ] `node --check` tất cả file JS đã sửa
- [ ] `node scripts/check-oms-core-regression-lock.mjs`
- [ ] `node scripts/test-ads-operations-ui.mjs`
- [ ] `node scripts/test-ui-design-system-guard.mjs`
- [ ] `git diff --check`

### Logic ADS — Thủ Công
- [ ] Capability check hoạt động
- [ ] Preview không ghi thật lên sàn
- [ ] Readback match → status = `success`
- [ ] Readback mismatch → status = `sàn_chưa_xác_nhận` (không báo thành công)
- [ ] Row bị block → không gửi live-write

### Logic ADS — Automation (Cron)
- [ ] `dry_run_mode = 1` → KHÔNG gọi bất kỳ API sàn nào, log đầy đủ proposed actions với status = `dry_run`
- [ ] Ngoài `time_windows` → tất cả status = `skipped`, reason = `outside_time_window`
- [ ] `emergency_stop = 1` → tất cả status = `skipped`, reason = `emergency_stop_active`
- [ ] `requires_admin_confirm = true` → status = `pending_admin_confirm`, không tự chạy
- [ ] `max_campaigns_per_run = 3`, có 10 proposed → chỉ 3 campaign chạy, 7 còn lại `no_action`
- [ ] Budget tăng vượt `budget_max` → cap đúng tại `budget_max`
- [ ] Lazada → status = `platform_not_supported_yet`, không fake success
- [ ] TikTok → status = `read_only_platform`, không fake success
- [ ] `created_by = "automation_cron"` trong tất cả log từ cron

### UI
- [ ] Không render bất kỳ từ kỹ thuật nào: `payload`, `endpoint`, `route`, `request_id`, `cache`, `guard`, `read-model`, `Core`, `raw response`, `JSON`, `dry_run`, `automation_cron`
- [ ] Switch Bật/Tắt: có chữ, màu xanh bật / xám tắt, kích thước tối thiểu 96×40px

### Production
- [ ] Mở từng tab ADS trong `E:\codex-chrome-profiles\shophuyvan-test`
- [ ] Bấm chức năng thật, xem action log
- [ ] Đọc lại ADS Core và readback từ sàn (sample an toàn)
- [ ] Nếu có thay đổi live → revert về trạng thái ban đầu khi an toàn

---

## Báo Cáo Cuối

Báo cáo phải ghi đủ theo thứ tự:

1. **Endpoints**: đã kiểm | đã dùng | thiếu quyền (lý do) | không tồn tại
2. **Live-write**: action thực hiện | shop sample | campaign/adgroup sample | before → after
3. **Kết quả**: request result | readback result | revert result (nếu có)
4. **Automation dry-run**: shop sample | số proposed actions | status summary
5. **Tests**: danh sách test đã chạy + pass/fail
6. **Deploy**: version Worker | version Static | production desktop / tablet / mobile result
