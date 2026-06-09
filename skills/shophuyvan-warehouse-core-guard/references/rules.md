# Shophuyvan Automation Rules Reference

## 1. Folder boundaries

### `E:\shophuyvan-analytics`

Repo for web/worker/docs only. Allowed content includes `apps/`, `docs/`, `scripts/`, `skills/`, `.github/`, `AGENTS.md`, config, source code, tests, and docs.

Do not create or keep Chrome profiles, Codex profiles, debug screenshots, debug payloads, automation logs, `.pid` files, `tmp-*` folders, raw HTML/JSON dumps, Playwright traces/videos, or long-lived Wrangler dev output here.

### `E:\shophuyvan-python-automation\oms_python`

All Python automation code lives here.

Use this structure:

- shared code: `oms_python/core`
- Shopee code: `oms_python/platforms/shopee/<feature>`
- Lazada code: `oms_python/platforms/lazada/<feature>`
- TikTok code: `oms_python/platforms/tiktok/<feature>`
- shared features: `oms_python/features/<feature>`
- desktop UI: `oms_python/ui`

Do not recreate root-level legacy folders such as `engines`, `parsers`, or `ui`.

### `E:\shophuyvan-python-automation\profiles\browser`

All automation Chrome profiles live here. Do not create profiles in `E:\codex-chrome-profiles`, runtime, temp, Desktop, Downloads, root `E:\`, or personal Chrome profile locations.

Jobs must resolve profiles from the shared profile map in `oms_python/core/automation_profiles.py`. The only mapped Chrome automation shops are TikTok `0909128999` and Shopee no-API `khogiadungcona`; Shopee/Lazada API shops must stay on Open Platform/Worker API.

Known profile examples:

- `HuyVan_Bot_Data_khogiadungcona`
- `HuyVan_Bot_Data_Shop1`
- `HuyVan_Bot_Data_Shop2`
- `HuyVan_Bot_Data_Shop3`
- `shophuyvan-runner-tiktok`

### `E:\shophuyvan-runtime`

All generated runtime artifacts live here: logs, screenshots, debug payloads, jobs, queue/status/lock, and runner-control files.

## 2. File creation rules

Before creating a file, decide its category and location. If the location is unclear, stop and report instead of creating a new folder.

Do not create files in root `E:\`, Desktop, Downloads, temp folders, Chrome profiles, or parallel repo copies.

Do not create duplicate files named `*_new`, `*_fix`, `*_final`, `*_clean`, or similar unless there is a specific migration reason and the old file will be removed or deprecated safely.

## 3. Repo hygiene

In `E:\shophuyvan-analytics`, do not keep:

- `artifacts/`
- `tmp-*`
- `*.log`
- `*.pid`
- screenshots
- payloads
- raw HTML/raw JSON
- traces/videos
- browser profiles
- Wrangler dev log/pid

Move needed debug output to `E:\shophuyvan-runtime`.

## 4. Automation safety

Never use:

- user Chrome profile
- production test profile for automation
- `taskkill chrome.exe`
- global Chrome shutdown
- ship/arrange/confirm/cancel/hủy/giao hàng actions
- Payment live sync
- fake completed or fake updated results
- Seller Center fallback for API shops

A job passes only when OMS/API readback confirms the data.

## 5. Order and label actions

Keep these flows separate.

### `pull_orders`

Purpose: pull/list/upsert marketplace orders into OMS.

Required fields include order id/sn/no, platform, shop, current status, tracking number, carrier, items, source, and last order sync time.

### `refresh_status`

Purpose: refresh existing OMS orders only.

Required fields include order id/sn/no, latest order status, fulfillment status, tracking number, carrier, tracking status/latest event when present, items, source, and last status sync time.

If required data cannot be parsed, fail with a specific error such as `status_parse_failed`, `tracking_parse_failed`, `items_parse_failed`, `selector_timeout`, `order_not_found`, `wrong_shop_context`, `update_failed`, or `readback_mismatch`.

Do not use “if available” to skip core operational data without a specific error and evidence.

### `sync_detail`

Sync detail-only data into Core/Warehouse: `status_detail`, `tracking_timeline`, `customer`, and `items`.

### `sync_finance`

Sync finance fields into Finance Core. Do not fake `actual_income`; use `estimated_income` and `profit_basis` until settlement/actual-income evidence exists.

### `retry_label`

Download/re-download label PDF and update Label Core. Do not call ship/arrange/confirm/cancel/hủy/giao hàng/sắp xếp vận chuyển. TikTok and Shopee no-API use local Chrome automation; API shops use Worker/Open Platform label document routes.

## 6. Runtime/log rules

All logs/debug output must go to `E:\shophuyvan-runtime`.

Log job id, run id, action type, platform/shop, profile path, current URL, current step, and error code.

Do not log cookies, tokens, passwords, localStorage secrets, full raw HTML, or huge payloads.

Recommended limits:

- Rotate logs at 10 MB.
- Keep debug payloads under 2 MB.
- Store selector-error snippets instead of full HTML.
- Store screenshots only for errors or explicit debug tasks.

## 7. Cleanup rules

Do not delete blindly. Audit first, then classify as keep/delete/archive.

Never delete Chrome profiles, pending/running queue files, current status/control files, unbacked source code, or real order/payment/refund data.

## 8. Test/report rules

Before reporting done, run the relevant checks:

- `python -m py_compile` for Python files changed
- relevant Python tests if present
- `node --check` and npm tests when JS/Worker files change
- `git diff --check`
- confirm no files were created outside allowed paths
- confirm no new Chrome profile was created outside `profiles/browser`
- confirm OMS readback for order automation tasks

Final reports must include changed files, new files, runtime/log paths, Chrome profile path used, tests run, and OMS readback result when applicable.
