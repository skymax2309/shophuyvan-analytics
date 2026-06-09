# LEGACY CLEANUP AUDIT

## 2026-05-20 - D1 rows-read / OMS Core cleanup

### Cloudflare cleanup

- Đã xoá D1 tạo nhầm trong account ShopHuyVan analytics: `fbshv_crm_db`, UUID `fbb7faa5-7dff-4165-ba3c-591adf5334e2`.
- Đã xoá Worker tạo nhầm trong account ShopHuyVan analytics: `fbshv-crm`, domain `fbshv-crm.nghiemchihuy.workers.dev`.
- Đã list lại sau xoá: `fbshv_crm_db` và `fbshv-crm` không còn trong account. Không đụng `huyvan-analytics-db`, `huyvan-worker-api`, `shophuyvan-analytics`, `shophuyvan-chat-api`, `huyvan-storage`.
- Grep repo sau xoá chỉ còn reference trong `AGENTS.md` cho profile CRM chính thức và trong file trạng thái/audit này; không thấy config runtime rác trỏ sang Worker/D1 tạo nhầm.

### Snapshot D1 production

- Database production: `huyvan-analytics-db`, UUID `60d0148f-9133-44a8-ad2f-da4d750995f6`.
- Snapshot trước khi đổi schema:
  - Info JSON: `.codex-artifacts/d1-backups/huyvan-analytics-db-info-20260520-165834.json`
  - Schema SQL: `.codex-artifacts/d1-backups/huyvan-analytics-db-schema-20260520-165834.sql`
  - Full export: `.codex-artifacts/d1-backups/huyvan-analytics-db-full-20260520-165834.sql` khoảng `206.3 MB`
- Trước tối ưu: `database_size=229105664`, `num_tables=88`, `rows_read_24h=597257938`, `read_queries_24h=361603`.
- Sau deploy/index/production check: `database_size=231485440`, `rows_read_24h=565178972`, `read_queries_24h=373893`. Đây là rolling 24h nên không thể coi là reset ngay trong ngày.

### Bảng chính

- `orders_v2`: `10564` dòng khi audit.
- `order_items`: `12542` dòng.
- `order_analytics`: `3741` dòng.
- `order_fee_details`: `1297` dòng.
- `order_labels`: `534` dòng.
- `order_tracking_core`: `18` dòng.
- `marketplace_webhook_events`: `10038` dòng.
- `marketplace_chat_conversations`: `416` dòng.
- `marketplace_chat_messages`: `1309` dòng.

### Query nặng tìm được

- Nặng nhất không chỉ là `/api/orders`; các query diagnostic/capability lặp lại mới là nguồn rows-read chính.
- 1 ngày gần nhất có các nhóm nặng: source summary trên `orders_v2`, label diagnostic join, badge/count OMS nhiều `COUNT(*)`, status runner diagnostic.
- 7 ngày gần nhất còn có chat conversation legacy dùng correlated subquery trên `marketplace_chat_messages`, promotion/webhook diagnostic và ADS/review workspace queries.

### Tối ưu đã chạy

- Thêm cache TTL trong `apps/worker-api/src/core/marketplace/shop-capability-core.js` cho capability list không chứa secret.
- Thêm cache TTL `30s` cho `/api/orders/badges` trong `apps/worker-api/src/worker-router/order-routes.js`, có header `X-OMS-Cache`.
- Thêm proxy metric cho `/api/orders` trong `apps/worker-api/src/routes/orders/read-update-webhook.js`: `request_id`, `query_count`, `duration_ms`, `X-OMS-Query-Ms`, `X-OMS-Query-Count`, `X-OMS-Data-Source`, `X-OMS-Cache`.
- Thêm migration index không destructive: `docs/migrations/009_d1_rows_read_oms_indexes.sql`.
- Index đã thêm:
  - `idx_orders_v2_platform_shop_source_updated`
  - `idx_orders_v2_platform_shop_status_sync`
  - `idx_orders_v2_platform_shop_status_source`
  - `idx_order_labels_order_error_refresh`
  - `idx_jobs_status_schedule_created`
  - `idx_marketplace_webhook_events_event_platform_shop_id`
  - `idx_marketplace_webhook_events_platform_shop_event_id`
  - `idx_marketplace_chat_messages_thread_sender_time`

### Dirty data dry-run

- `orders_v2` duplicate groups: `0`.
- `order_items` exact duplicate groups: `0`.
- Orphan `order_items`: `0`.
- Orphan `order_fee_details`: `0`.
- Orphan `order_labels`: `0`.
- Stale API shop Seller Center diagnostics: `20` dòng cần cleanup riêng sau khi chốt rule update. Lượt này chỉ dry-run, không xoá dữ liệu đơn hàng thật.

### Legacy/code audit

- Scan `taskkill chrome` trong `apps`/`scripts`: không thấy runtime helper dùng `taskkill chrome.exe`; chỉ có guard test `scripts/test-tiktok-runner-control.mjs`.
- Scan profile user `E:\codex-chrome-profiles\shophuyvan-test` trong code runtime `apps`/`scripts`: không có hit. Profile này chỉ dùng kiểm UI thủ công/CDP, không dùng automation nền.
- Legacy label route `/api/labels/refresh/*` còn ở `apps/worker-api/src/worker-router/file-routes.js` để trả `410`, được giữ làm compat guard.
- Các chuỗi `ship_order`, `mass_ship_order`, `arrange`, `cancel_order` còn xuất hiện trong dry-run/preview/guard test và OMS ops cũ; chưa xoá vì cần audit caller/UI theo từng route trước khi chặn sâu hơn.
- Python/local helper chưa xoá trong lượt này vì worktree đang bẩn rộng và cần audit caller/import/scheduler/lock file trước khi xoá an toàn.

### Production check

- Worker main deploy: `73838c52-700d-4f1e-adad-43b4ca46e600`.
- `/api/orders?limit=50`: HTTP 200, `50` dòng, không có `fee_raw_data`, `raw_fee_payload`, `raw_tracking_payload`, `raw_order_json`, `source_json`.
- `/api/orders?limit=200`: HTTP 200, `200` dòng, query count `8`, không có raw payload nặng.
- `/api/orders/changes?limit=50`: HTTP 200.
- `/api/orders/badges?platform=shopee`: lượt 1 `miss`, lượt 2 `hit`.
- Filter production đọc an toàn pass: `PENDING`, `UNPAID`, `SHIPPING`, `COMPLETED`, `CANCELLED`, `RETURN`, `platform=shopee`, `shop=chihuy1984`, `data_status=unmapped`.
- Browser production bằng Chrome profile `E:\codex-chrome-profiles\shophuyvan-test`: desktop `1366x900`, tablet `820x1180`, mobile `390x844` đều có đơn, không `Failed to fetch`, không tràn ngang.
- Popup phí mở được và hiển thị Finance Core; tracking drawer mở được read-only cho đơn Shopee.

### Còn mở

- Cần tách read model/cache bền hơn cho OMS list nếu Cloudflare usage vẫn cao sau khi rolling 24h ổn định.
- Cần cleanup stale API shop Seller Center diagnostics bằng script batch nhỏ sau khi chốt điều kiện update.
- Cần audit riêng các module dry-run Shopee ops/API phase 2 trước khi xoá hoặc chặn thêm route public.
- Cần audit Python/local helper bằng lock/status/scheduler trước khi xoá file.

## Follow-up audit 2026-05-20

### Runtime runner thật

- Đã kiểm `E:\shophuyvan-python-automation`, `E:\shophuyvan-runtime`, `E:\codex-chrome-profiles` trong phạm vi runner TikTok/Shopee no-API.
- Local helper/Radar đang chạy qua PID được đọc từ status, không dùng `taskkill chrome.exe` và không kill Chrome theo tên process chung.
- TikTok profile automation đúng: `E:\codex-chrome-profiles\shophuyvan-runner-tiktok`.
- Shopee no-API profile automation đúng: `E:\codex-chrome-profiles\shophuyvan-runner-shopee-khogiadungcona`.
- TikTok job `1102`: queued -> running -> failed `runner_requires_login`; đây là execution thật, không phải chỉ enqueue.
- Shopee no-API job `1103`: queued -> running -> completed, nhưng 0 update vì order thiếu `seller_center_detail_url`.
- `codex_hotfix_final_pause` không còn trong runtime; pause hiện tại là `one_shot_batch_completed`.

### Dirty cache/read model

- Dry-run lại không thấy `Mã yêu cầu trả hàng` hoặc `Thiếu chi tiết sản phẩm` còn là item trong `order_items`.
- `/api/products?search=SP_` mặc định không trả placeholder; `include_temp=1` mới hiện placeholder đã soft-hide.
- Không xoá đơn thật, không xoá payment/refund/return thật trong lượt follow-up.
- Return/refund read model được guard lại ở Finance Core: API list hiển thị `return_pending` / `Chờ hoàn/trả`, không dùng raw analytics dương để hiện lãi xanh.
- Tracking read model guard: khi `order_tracking_core` có timeline API hợp lệ thì lỗi batch cũ chỉ còn diagnostic/history, không làm status chính của OMS row.

### File/code cleanup

- Không xoá thêm file legacy vì worktree vẫn đang bẩn rộng và nhiều file legacy còn cần audit caller/import/route trước khi hard delete.
- Disable/guard đã thực hiện: Chat Worker Lazada không tạo blank conversation khi thiếu official session; Worker main legacy `/api/chat/context` và `/api/chat/conversations` vẫn trả `410`.
- Helper nguy hiểm không được mở lại: không gọi ship/arrange/confirm/cancel, không sync Payment live, không dùng profile user cho automation nền.
- Backend `/api/operations/shopee/action` đã khóa `ship_order`/`mass_ship_order` và các write actions bằng `write_action_disabled` kể cả khi truyền `execute=true` + confirm phrase; production probe trả `sent_to_shopee=false`.
- Frontend dry-run Shopee ops kiểm `data.error` trước khi báo OK, nên response `write_action_disabled` không còn hiện toast thành công giả.
- TikTok label/helper đã bỏ nhánh bấm `Sắp xếp vận chuyển`; nếu thấy nút này thì log cảnh báo và bỏ qua để giữ read-only.

## Stabilization cleanup 2026-05-20

### Dirty read model/cache cleanup đã chạy

- Backup trước khi xoá item giả: `cleanup_order_items_dirty_placeholder_backup_20260520`, `20` dòng.
- Xoá thật khỏi `order_items`: `10` dòng `Mã yêu cầu trả hàng` và `10` dòng `Thiếu chi tiết sản phẩm`.
- Tạo `order_return_refund_markers` và insert `10` marker để giữ trạng thái hoàn/trả trên OMS.
- Soft-hide Product/SKU tạm: `58` dòng `SP_` được set `hidden_from_mapping=1`, `sku_type=placeholder`; không hard-delete vì có thể còn lịch sử/mapping.
- Không xoá `orders_v2`, không xoá `order_analytics`, không xoá `order_fee_details`, không xoá payment/return/refund records thật.

### Guard chống tái phát

- `status-workflow.js` và `read-update-webhook.js` phân loại dirty markers trước khi compact/render item summary.
- `/api/products` ẩn `SP_` mặc định; Map SKU chỉ gọi `include_temp=1` khi operator bật `Hiện mã tạm SP_`.
- Finance Core xử lý terminal status để đơn hủy/hoàn không còn lãi xanh: `canceled_excluded`, `return_pending`.
- Worker main legacy chat `/api/chat/context` và `/api/chat/conversations` vẫn `410`; OMS dùng Core chat-target + Chat Worker.

### Runtime/TikTok cleanup

- Clear đúng runtime path `E:\shophuyvan-runtime\runner-control\tiktok\pause.json` / `status.json` cho reason cũ `codex_hotfix_final_pause`.
- `tiktok_runner_control.py` tự clear legacy pause reason; `oms_radar_tab.py` không còn hard-code skip TikTok vì khóa cũ.
- Restart chỉ đúng Radar PID lấy từ status/commandline; không `taskkill chrome.exe`, không kill Chrome theo tên process chung.

### Production verification bổ sung

- `/api/orders?limit=50` và `limit=200` pass sau cleanup; dirty markers không còn là product item.
- Map SKU production không trả `SP_` khi không bật temp; bật `include_temp=1` mới thấy `58` mã tạm.
- Scanner bridge API tạo session/connect/result pass; production QR self-host render được.
- Browser production profile `E:\codex-chrome-profiles\shophuyvan-test` pass desktop/tablet/mobile; không `Failed to fetch`, sidebar không reset `0`.
