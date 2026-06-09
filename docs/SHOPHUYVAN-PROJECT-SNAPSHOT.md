# ShopHuyVan — Project Master Snapshot

> **Mục đích:** File này là tài liệu tổng hợp duy nhất bạn cần gửi Claude để nhận phương án nhanh nhất.
> Cập nhật cuối: 2026-06-09. Gộp từ 20 docs nguồn.

---

## 1. Cấu trúc thư mục dự án

```
shophuyvan-analytics/           ← Mono-repo chính (GitHub: skymax2309/shophuyvan-analytics)
│
├── apps/
│   ├── worker-api/             ← Main Worker (Cloudflare Workers)
│   │   └── src/
│   │       ├── core/           ← Core data layers
│   │       │   ├── products/   ← Product Master / SKU
│   │       │   ├── orders/     ← Order Core (OMS)
│   │       │   ├── finance/    ← Finance / Settlement
│   │       │   ├── shared-data/← Shop Core (list shop, display name)
│   │       │   └── external/   ← External API (Facebook CRM)
│   │       ├── routes/
│   │       │   ├── discounts/  ← Shopee/Lazada Promotions + Flash Sale
│   │       │   ├── ads/        ← ADS campaigns, adgroups, metrics
│   │       │   ├── external/   ← /api/external/* cho Facebook CRM
│   │       │   ├── label/      ← Tem/waybill Shopee + Lazada
│   │       │   ├── orders/     ← OMS sync, status, backfill
│   │       │   └── marketplace-chat/ ← Shopee SellerChat bridge
│   │       └── features/shopee/ ← Shopee API adapters
│   │
│   ├── chat-worker-api/        ← Chat Worker riêng (Cloudflare Workers)
│   │   └── src/core/
│   │       ├── ai-agent-evidence-core.js
│   │       ├── ai-policy-core.js
│   │       ├── ai-settings-defaults.js
│   │       ├── conversation-core.js
│   │       └── sync-core.js
│   │
│   └── fe/                     ← Frontend static (deploy lên shophuyvan-analytics Worker)
│       ├── pages/
│       │   ├── chat-cskh.html  ← Chat/CSKH UI chính
│       │   ├── ads.html        ← ADS quảng cáo
│       │   ├── promotions.html ← Khuyến mãi sàn (tách khỏi ads)
│       │   ├── settings.html   ← Cài đặt toàn hệ thống + AI agent
│       │   └── admin-shopee-diagnostics.html
│       ├── js/dashboard/
│       │   ├── chat/           ← Chat UI modules (state, render, events, auto-send)
│       │   ├── ads/            ← ADS + Promotion modules
│       │   └── chat-settings.js / chat-settings-agent.js
│       └── css/dashboard/
│
├── scripts/                    ← Test + audit scripts (node)
│   ├── test-chat-ai-policy.mjs
│   ├── test-finance-taxonomy.mjs
│   ├── test-tiktok-seller-center-finance.mjs
│   ├── check-oms-core-regression-lock.mjs
│   └── test-ui-design-system-guard.mjs
│
├── docs/                       ← Tài liệu kỹ thuật (xem mục 9)
│
└── E:\shophuyvan-python-automation\   ← Local Python automation (ngoài repo)
    └── oms_python/
        ├── platforms/shopee/orders/   ← Shopee Seller Center fallback
        ├── platforms/tiktok/orders/   ← TikTok Seller Center
        ├── platforms/tiktok/promotion/← TikTok upload giá KM
        ├── features/chat/             ← Browser helper Chat no-API
        └── core/browser_runtime/      ← Browser window/preset config

E:\tool zalo\                   ← Zalo local helper (Node.js, cổng 8794)
    └── src/storage/store.js    ← Session/store với backup corrupt JSON
```

---

## 2. Cloudflare Deploy Map

| Worker | Cloudflare Account | Wrangler Profile |
|---|---|---|
| `huyvan-worker-api` (Main) | `nghiemchihuy@gmail.com` / `efe50fab…` | default |
| `shophuyvan-analytics` (Static FE) | `nghiemchihuy@gmail.com` / `efe50fab…` | default |
| `shophuyvan-chat-api` (Chat Worker) | `zacha030596@gmail.com` / `39cf0fe9…` | chat profile |

**Base URLs:**
- Main Worker: `https://huyvan-worker-api.nghiemchihuy.workers.dev`
- Chat Worker: `https://shophuyvan-chat-api.zacha030596.workers.dev`
- Static FE: `https://shophuyvan-analytics.nghiemchihuy.workers.dev`

---

## 3. Shop Map & Capability

| Shop | Sàn | Loại | API Client | Chat |
|---|---|---|---|---|
| `chihuy1984` | Shopee | API | `marketplace_client` | Bridge (SellerChat) |
| `chihuy2309` | Shopee | API | `marketplace_client` | Bridge (SellerChat) |
| `phambich2312` | Shopee | API | `marketplace_client` | Bridge (SellerChat) |
| `khogiadungcona` | Shopee | No-API | Seller Center fallback | Browser helper |
| `kinhdoanhonlinegiasoc@gmail.com` | Lazada | API | Lazada client | Lazada IM bridge |
| `0909128999` | TikTok | No-API | Seller Center local | Browser helper |
| Zalo `0909128999`, `0848881111` | Zalo | Local helper | - | Port 8794 |

**Profile Chrome automation:**
- Shopee no-API: `E:\shophuyvan-python-automation\profiles\browser\HuyVan_Bot_Data_khogiadungcona`
- TikTok: `E:\shophuyvan-python-automation\profiles\browser\shophuyvan-runner-tiktok`
- Lazada manual: `E:\shophuyvan-python-automation\profiles\browser\HuyVan_Bot_Data_lazada_kinhdoanhonlinegiasoc`
- Zalo: `Zalo_Shop_Huy_Van_0909128999`, `Zalo_Nghiem_Chi_Huy_0848881111`
- Test/Codex: `E:\codex-chrome-profiles\shophuyvan-test`

---

## 4. Core Architecture — Nguyên tắc bất biến

```
Sàn / API / import / browser helper / nhập tay
    ↓
Warehouse Core / Core Data (D1 chính)
    ↓
Chat / OMS / Product Master / Dashboard / ADS / CRM chỉ đọc read-model
```

**Luật tuyệt đối:**
- `0` = dữ liệu thật, `null` = thiếu dữ liệu. Không ép `null → 0`.
- UI không tự tính nghiệp vụ, không tự map trạng thái, chỉ render read-model từ Core.
- Shop có API → dùng API. Không được báo thiếu endpoint mà không tìm.
- Không đổi schema DB đột ngột; phải làm migration/compat layer.

### Các Core chính và bảng DB tương ứng

| Core | Bảng chính |
|---|---|
| Product Core | `products`, `product_variations`, `product_logistics_profiles` |
| Warehouse / Purchase Core | `purchase_batches`, `purchase_batch_items`, `inventory_cost_layers`, `sku_current_cost_read_model` |
| Order Core | `orders_v2`, `order_items`, `order_tracking_core`, `order_fee_details` |
| Finance Core | `order_analytics` (rebuild từ settlement + cost setting) |
| ADS Core | `ads_campaigns`, `ads_adgroups`, `ads_product_links`, `ads_daily_metrics`, `ads_decision_read_model`, `ads_write_capabilities`, `ads_action_logs` |
| Promotion Core | `marketplace_discounts`, `marketplace_discount_items`, `marketplace_vouchers`, `marketplace_promotion_programs`, `marketplace_promotion_items`, `marketplace_promotion_apply_queue` |
| Chat Core | `chat_conversations`, `chat_messages`, `ai_suggestions`, `ai_knowledge_base`, `ai_learning_audit_logs` |
| Label Core | `label_status` (trong `orders_v2`) |
| Shop Core | `shops` (đọc qua `/api/core/shops`) |

---

## 5. Tính năng hiện tại — Trạng thái từng module

### 5A. OMS / Đơn hàng
- **Shopee API shops:** sync order, status, tracking qua Open Platform. Label flow: `create_shipping_document → get_shipping_document_result (poll READY) → download_shipping_document`.
- **Lazada API:** sync qua Lazada Open Platform. Label dùng PrintAWB batch nhỏ (`limit=8`, max `20`, guard subrequest).
- **TikTok no-API:** Seller Center parser (local helper), one-shot batch. Finance từ `tiktok_seller_center_finance_transaction`.
- **Shopee no-API `khogiadungcona`:** Seller Center detail fallback qua Python runner.
- **Guard quan trọng:** `allowDocumentGenerate=true` chỉ cho `/api/label/:orderId/refresh` Shopee API; `allowFulfillmentAction=false` luôn luôn.
- **Finance TikTok lock:** `ADS ngoài ví` và `PiShip` chỉ ở nhóm `ops_cost_setting_total`, không được cộng vào `platform_deduction_total` hay `total_deductions`.
- **Order fields mới:** `payment_method`, `payment_method_source`, `customer_note`, `customer_note_source`, `order_tracking_core.tracking_events`.
- **Source resolver:** `apps/worker-api/src/routes/order-data-source-resolver.js` — mọi route phải qua đây trước khi ghi `status_source`.

### 5B. Product Master / Warehouse
- **Giá vốn theo lô:** Mỗi lần nhập tạo `purchase_batch`. `current_cost = weighted_average_remaining_stock`. Không dùng `landed_cost_per_unit` của lô mới nhất làm giá hiện tại.
- **Read-model giá vốn:** `sku_current_cost_read_model`, source `warehouse_purchase_core`.
- **Chỉnh sửa nhập sai:** `PATCH /api/purchase/batch-item-edit` bắt buộc lý do, tạo `purchase_batch_revisions`, tính lại cost layer.
- **Kho chung:** Không có dimension shop trong tồn/giá vốn. Khóa kho là `internal_sku`.
- **External Product API** (cho Facebook CRM): `GET /api/external/products` trả đủ `description`, `imageUrl`, `images[]`, `promptAssets.allImageUrls`, `promptAssets.promptText`.

### 5C. ADS / Quảng cáo
- **Shopee ADS:** Dùng `ads_client` với `SHOPEE_ADS_*` env. Tách hoàn toàn khỏi `marketplace_client`.
- **Màn ADS:** Chỉ còn `ads.html` cho quyết định quảng cáo. Khuyến mãi đã tách sang `promotions.html`.
- **Live write guard:** `ads_write_capabilities` + `ads_action_logs` + readback bắt buộc.
- **ADS decision read-model:** `recommendation`, `recommendation_reason`, `data_status`, `profit_after_ads`, `roas`, `acos`.

### 5D. Khuyến mãi sàn (8 module)
| Module | Sàn | Trạng thái |
|---|---|---|
| Discount | Shopee | `in_progress_verified_api` — execute queue qua `marketplace_client`, refetch verify |
| Voucher | Shopee | Write locked chờ diagnostics PASS |
| Bundle Deal | Shopee | Write locked |
| Add-On Deal | Shopee | Write locked |
| Shop Flash Sale | Shopee | `in_progress_verified_api` — live-write verified, cleanup 0-item done |
| Voucher | Lazada | Read-only / chưa có endpoint write confirmed |
| Freeship | Lazada | Skeleton |
| Flexicombo | Lazada | Skeleton |

**Guard chung:** `SHOPEE_LIVE_WRITE_ENABLED=false` chặn tất cả write thật. Chỉ bật sau khi diagnostics PASS.
**Diagnostics:** `POST /api/admin/shopee/diagnostics` + `pages/admin-shopee-diagnostics.html`.

### 5E. Chat / CSKH
- **UI:** `chat-cskh.html`, `apps/fe/js/dashboard/chat/`
- **Worker:** `apps/chat-worker-api` (Cloudflare account Chat riêng)
- **Channels:**
  - Shopee API: SellerChat polling/bridge. `send_capability=bridge`.
  - Lazada: Lazada IM bridge (skeleton `adapter_not_implemented` cho các kênh khác)
  - TikTok no-API: browser helper, push vào `/api/chat/browser-helper/push`
  - Zalo: local Node.js helper cổng `8794`, endpoint `/api/shophuyvan-chat/send`
  - Facebook: skeleton
- **Read-state invariant:** `unread_count` chỉ tăng khi message khách tạo mới trong Core. Sync/polling trùng không cộng lại.
- **Chat AI:** Xem mục 5F.

### 5F. Chat AI Agent (CSKH)
**Trạng thái hiện tại: `suggest_only` — AI draft, nhân viên gửi.**

| Cài đặt production hiện tại | Giá trị |
|---|---|
| `ai_mode` | `suggest_only` |
| `allow_auto_send` | `false` |
| `chat_ai_agent_config.mode` | `suggest_only` |
| `zalo_reply_config.mode` | `suggest_only` |
| Gemini keys active | 2/5 |

**4 phases đã implement:**
1. **Phase 1** — Settings trung tâm tại `/settings`: `chat_ai_agent_config`, AI learning notes 2 sections (`AI CSKH - luật vận hành`, `Zalo - cách trả lời riêng`). Raw conversation learning disabled.
2. **Phase 2** — Suggestion evidence: mỗi draft có `prompt_context` gồm source labels, order/product/policy evidence, risk labels, handoff reason. AI draft text được clean trước khi đưa vào composer.
3. **Phase 3** — Approved learning loop: `ai_knowledge_base` với dedupe, sanitize (redact phone/email/order codes), `ai_learning_audit_logs`. Chỉ học sau khi nhân viên gửi thành công.
4. **Phase 4** — Guarded auto-send readiness: `auto_send_readiness` trong response AI (suggestion_id, delay_seconds, countdown requirement, cancel requirement). Countdown/cancel shell đã có trong UI nhưng chưa kích hoạt.

**AI Context Builder:** Chat Worker → Worker chính `/api/core/orders/by-conversation/:id`, `/api/core/products/by-sku/:sku`, `/api/core/products/search`. Không đưa cost/raw payload vào prompt.

**Để bật auto-send:** cần đủ 5 điều kiện: send bridge thật + confidence cao + không có risk nhạy cảm + countdown/cancel test production + audit log verified.

### 5G. Facebook Ads CRM — External API
Base: `https://huyvan-worker-api.nghiemchihuy.workers.dev`
Auth: `Authorization: Bearer <API_KEY_FOR_FACEBOOK_CRM>` hoặc `X-API-Key`.

**Endpoints chính:** Products (list/detail/sku/price), Shopee full content, Inventory (check/reserve/commit/cancel), Orders (create from Facebook, get by id/source), Webhook (test/deliveries).

**Webhook events:** `product.*`, `inventory.*`, `order.*`. Signature: `HMAC-SHA256(WEBHOOK_SECRET, rawBody)`.

### 5H. Python Automation Local
Repo: `E:\shophuyvan-python-automation\`

| Action | Script | Shop |
|---|---|---|
| Kéo đơn mới | `keodonmoi.py` | API + no-API |
| Cập nhật trạng thái | `capnhattrangthai.py` | API + no-API |
| Đồng bộ chi tiết | `dongbochitiet.py` | Shopee no-API SC |
| Cập nhật tài chính | `capnhattaichinh.py` | TikTok SC |
| Tạo tem | `taitem.py` | API |
| Upload giá KM TikTok | `platforms/tiktok/promotion/upload.py` | TikTok `0909128999` |
| Upload giá KM Shopee | `platforms/shopee/promotion/shopee_promo.py` | `khogiadungcona` |
| Chat sync no-API | `features/chat/automation_browser.py` | `khogiadungcona`, TikTok |

**Window sizing:** Mặc định `compact 620×480`, headful/visible. Không dùng `--start-minimized`.

**Scheduler:** `E:\shophuyvan-runtime\auto-order-scheduler\status.json`. Radar/local helper quản lý interval cho no-API shops.

---

## 6. UI Design System

**Tokens:** `apps/fe/css/theme/shophuyvan-design-tokens.css`
**Dark theme:** `--shv-bg-page` (xanh đen đậm), không dùng card trắng trong vùng dark.
**Responsive breakpoints:** Desktop `1366×900`, Tablet `820×1180`, Mobile `390×844`.
**Pass khi:** không tràn ngang, không overlap, card không bị cắt, action chính bấm được.
**Badge:** Ghi vấn đề thật (`Lãi âm`, `Không hiệu quả`, `Sắp hết hàng`), không ghi mã kỹ thuật.
**Table số:** căn phải, `font-variant-numeric: tabular-nums`.
**Cột `Vấn đề` và `Hành động`:** phải tách riêng.

---

## 7. Shopee API — Phân loại client bắt buộc

| Việc | Client | Env prefix |
|---|---|---|
| ADS campaign/keyword/budget/reporting | `ads_client` | `SHOPEE_ADS_*` |
| Discount/Voucher/Bundle/Add-On/Flash Sale/Product/Order | `marketplace_client` | `SHOPEE_MARKETPLACE_*` |

**App `ADS GIADUNGHUYVAN` (Ads Service):** chỉ hợp lệ cho `ads_client`. Không dùng để gọi Discount/Voucher/Bundle/Add-On/Flash Sale.

**Live write guard:** `SHOPEE_LIVE_WRITE_ENABLED=false` (production mặc định). Chỉ bật sau diagnostics pass.

---

## 8. Version history gần nhất (Deploy đã verify)

| Date | Worker | Version | Nội dung |
|---|---|---|---|
| 2026-06-04 | `shophuyvan-chat-api` | `9cabb70f` | Automation browser window sizing |
| 2026-06-04 | `huyvan-worker-api` | `add5e98d` | External Product Core API trả content + images |
| 2026-06-03 | `shophuyvan-chat-api` | `681fc9c6` | Chat AI guarded auto-send readiness |
| 2026-06-03 | `shophuyvan-chat-api` | `f6a05400` | Chat AI safe-mode backend |
| 2026-05-31 | `huyvan-worker-api` | `e99fe8bb` | Flash Sale cleanup + live-write verified |
| 2026-05-28 | `huyvan-worker-api` | `204213c9` | Product Core search tên dài (Chat AI context) |
| 2026-05-24 | `huyvan-worker-api` | `a637c316` | Tách ADS và Promotions, ADS Core tables |
| 2026-05-27 | `huyvan-worker-api` | `25ae3ebb` | TikTok Finance Lock |

---

## 9. Tài liệu docs/ — Phân loại sau gộp

Sau khi gộp, các file docs được tổ chức như sau. **Chỉ cần giữ file này + 3 file live:**

| File | Trạng thái | Dùng để |
|---|---|---|
| **SHOPHUYVAN-PROJECT-SNAPSHOT.md** (file này) | ✅ Mới — Gộp tất cả | Gửi Claude, điểm bắt đầu duy nhất |
| `AGENTS.md` | ✅ Giữ | Luật gốc, routing skill, safety rules |
| `PROJECT-CURRENT-STATE.md` | ✅ Giữ | Changelog deploy theo ngày (append-only) |
| `marketplace-endpoint-progress.md` | ✅ Giữ | Log endpoint/verify theo từng lượt |
| `core-data-map.md` | 🔶 Có thể archive | Nội dung đã gộp vào snapshot này (Mục 4, 5A-5C) |
| `warehouse-core-map.md` | 🔶 Có thể archive | Nội dung đã gộp vào snapshot này (Mục 4, 5B) |
| `chat-refactor-map.md` | 🔶 Có thể archive | Nội dung đã gộp vào snapshot này (Mục 5E) |
| `shop-order-product-core-plan.md` | 🔶 Có thể archive | Nội dung đã gộp vào snapshot này (Mục 5A, 5B) |
| `chat-cskh-deploy-strategy.md` | 🔶 Có thể archive | Nội dung đã gộp vào snapshot này (Mục 5E) |
| `chat-ai-agent-core-integration-plan.md` | 🔶 Có thể archive | Nội dung đã gộp vào snapshot này (Mục 5F) |
| `chat-core-schema.md` | ✅ Giữ làm reference | Schema JSON chuẩn Message/Conversation/AI |
| `facebook-crm-api.md` | ✅ Giữ | API spec đầy đủ cho Facebook CRM dev |
| `shopee-required-permissions.md` | ✅ Giữ | Bảng quyền chi tiết từng endpoint Shopee |
| `shopee-live-api-audit.md` | 🔶 Có thể archive | Đã lỗi thời (dry-run chưa chạy); thay bằng diagnostics live |
| `shopee-real-action-audit.md` | ✅ Giữ | Audit table trạng thái thật từng tính năng |
| `ui-design-system.md` | ✅ Giữ | Design tokens, rules layout, ví dụ chuẩn |
| `ui-production-checklist.md` | ✅ Giữ | Checklist nghiệm thu UI |
| `shophuyvan-ui-master-prompt_.md` | ✅ Giữ | Master prompt cho UI mới |
| `marketplace-endpoint-master-checklist.md` | 🔶 Xem xét merge vào progress | Phần lớn trùng với `marketplace-endpoint-progress.md` |
| `python-automation.md` | ✅ Giữ | Chi tiết Python runner, profile, job flow |
| `prompt_codex_api_webhook_tmdt.md` | 🔶 Có thể archive | Prompt tạo API ban đầu, đã xong — thay bằng `facebook-crm-api.md` |

---

## 10. Hướng đi tiếp theo (Roadmap ưu tiên)

### Ưu tiên cao — Chưa hoàn thiện
1. **Shopee Voucher/Bundle/Add-On live-write:** Cần diagnostics PASS với `marketplace_client` đúng quyền Marketing/Seller. Sau đó mở write guard từng module.
2. **Chat AI auto-send Phase 4 mở thật:** Cần xác minh: (1) send bridge thật từng kênh, (2) countdown/cancel UI production click-flow, (3) audit log send result. Bắt đầu với Shopee bridge trước, Zalo sau.
3. **Lazada Chat IM bridge:** Hiện còn skeleton. Cần implement Lazada IM Open Platform adapter vào Chat Worker.
4. **Facebook/TikTok Chat bridge:** Skeleton — chưa có adapter.

### Ưu tiên trung — Cải thiện
5. **Automation browser `automation_browser.py` refactor:** File >30KB, cần tách module theo AGENTS.md.
6. **Shopee no-API `khogiadungcona` Chat:** Browser helper đang chạy nhưng cần verify ổn định long-term.
7. **Lazada Freeship/Flexicombo:** Khởi tạo adapter read + write skeleton.
8. **Purchase Core — ghi thật production:** Dữ liệu lô nhập an toàn cần xác nhận trước khi confirm vào Core.

### Ưu tiên thấp — Tech debt
9. **`marketplace-endpoint-master-checklist.md` merge vào progress:** Tránh 2 file trùng lặp.
10. **`core-data-map.md`, `warehouse-core-map.md`, `chat-refactor-map.md` archive:** Sau khi snapshot này được confirm đủ.

---

## 11. Quick Reference — Khi hỏi Claude

**Cách dùng file này hiệu quả nhất:**

```
Gửi cùng: file này (SHOPHUYVAN-PROJECT-SNAPSHOT.md)
+ PROJECT-CURRENT-STATE.md (nếu task liên quan deploy/changelog)
+ file spec liên quan (vd: facebook-crm-api.md nếu task liên quan CRM)

Sau đó đặt câu hỏi cụ thể, ví dụ:
- "Tôi muốn bật Shopee Voucher live-write. Cần làm gì theo thứ tự?"
- "Implement Lazada Chat IM bridge vào Chat Worker, bắt đầu từ đâu?"
- "Tạo UI cho màn Purchase Core — nhập hàng mới."
```

**Các rule bắt buộc Claude phải biết khi làm task:**
- Đọc `AGENTS.md` (routing skill) trước khi code bất kỳ Core nào.
- Không fake success, không báo "đã xong" khi chưa verify production.
- Mọi write thật phải có: preview → admin confirm → live-write → readback verify → log.
- Deploy phải ghi version + verify endpoint + test responsive 3 viewport.

---

*Snapshot này được tổng hợp từ: AGENTS.md, PROJECT-CURRENT-STATE.md, core-data-map.md, warehouse-core-map.md, chat-refactor-map.md, shop-order-product-core-plan.md, chat-cskh-deploy-strategy.md, chat-ai-agent-core-integration-plan.md, chat-core-schema.md, facebook-crm-api.md, shopee-live-api-audit.md, shopee-real-action-audit.md, shopee-required-permissions.md, ui-design-system.md, marketplace-endpoint-progress.md, marketplace-endpoint-master-checklist.md, python-automation.md, prompt_codex_api_webhook_tmdt.md, shophuyvan-ui-master-prompt_.md, ui-production-checklist.md*
