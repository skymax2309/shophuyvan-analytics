### 2026-06-09 - Worktree checkpoint and runtime artifact cleanup

- Scope:
  - `.gitignore`
  - `docs/GIT-WORKFLOW.md`
  - `apps/worker-api/migrations/`
  - `apps/worker-api/src/features/shopee/logs/shopeeLogMask.js`
  - `docs/audits/`
  - `docs/migrations/`
  - Runtime/debug artifacts under `.playwright-mcp/`, `artifacts/`, and root `tmp-*`.
- Checkpoint:
  - Created commit `b1f1d7a` with the complete non-ignored worktree state.
  - Pushed successfully to `origin/main`.
  - Verified `origin/main` and local `main` both point to `b1f1d7a`.
- Cleanup:
  - Moved 30 tracked/ignored artifact roots and files, 474 files total, about 75.79 MB, to `E:\shophuyvan-runtime\cleanup-archive\20260609-checkpoint-b1f1d7a`.
  - Removed regenerable `.wrangler` caches and `scripts/__pycache__`; no Wrangler process was active.
  - Kept `node_modules`, `apps/worker-api/node_modules`, `profiles.local.json`, schema SQL, and database backup SQL.
- Ignore fixes:
  - Added `.playwright-mcp/` and root `tmp-*.html|js|pid` patterns.
  - Re-included canonical SQL under `apps/worker-api/migrations`, `docs/migrations`, and `docs/audits`.
  - Re-included `apps/worker-api/src/features/shopee/logs/shopeeLogMask.js`; caller audit found five active imports, so this file is KEEP-CORE and must be tracked.
- Classification:
  - KEEP-CORE: application source, Chat Worker, Worker Core/routes, frontend, tests, canonical migrations, `shopeeLogMask.js`.
  - KEEP-WRAPPER: existing registered public routes remain unchanged in this cleanup.
  - DEPRECATE: none added in this pass.
  - DELETE/ARCHIVE: `.playwright-mcp`, `artifacts`, root `tmp-*`, `.wrangler`, and Python bytecode cache.
- Verification:
  - `rg 15.1.0` available for caller audit.
  - ECC Hook Bridge `before-edit` passed with zero secret/debug findings.
  - `git clean -ndX` after cleanup lists only protected local files/dependencies: database backup SQL, schema SQL, `profiles.local.json`, and two `node_modules` directories.
  - No production deploy or marketplace endpoint change in this cleanup pass.

### 2026-06-04 - Automation browser window sizing settings

- Scope:
  - `apps/fe/settings.html`
  - `apps/fe/css/dashboard/chat-settings.css`
  - `apps/fe/js/dashboard/chat-settings.js`
  - `apps/fe/js/dashboard/chat/data.js`
  - `apps/fe/js/dashboard/chat/state.js`
  - `apps/chat-worker-api/src/core/ai-settings-defaults.js`
  - `E:\shophuyvan-python-automation\oms_python\core\browser_runtime\settings.py`
  - `E:\shophuyvan-python-automation\oms_python\features\chat\automation_browser.py`
  - `E:\shophuyvan-python-automation\oms_python\features\reports\download_reports.py`
  - `E:\shophuyvan-python-automation\oms_python\platforms\tiktok\orders\kiemtra.py`
  - `E:\shophuyvan-python-automation\oms_python\platforms\tiktok\orders\kiemtrareadonly.py`
- Done:
  - Added Chat settings fields for automation browser preset and custom width/height/left/top.
  - Chat sync now sends saved compact/custom browser bounds to the local helper instead of hardcoding `1380x860`.
  - Python automation runtime now defaults to compact visible window `620x480` and supports presets `compact`, `top_left`, `top_right`, `desktop`, `custom`.
  - Removed `--start-minimized` launch paths from chat, report, and TikTok automation. Hidden/minimized requests are recorded only as diagnostics and forced off because automation must stay visible/headful.
  - Fixed Settings Zalo local fetch message: production now reports Chrome Local Network Access blocking instead of generic `Failed to fetch`.
  - Restarted Zalo local helper on `127.0.0.1:8794`; 2 Zalo profiles are attached on CDP `9241/9242`, scheduler running, auto-send off.
  - Patched `E:\tool zalo\src\storage\store.js` to backup corrupt `data/store.json` and continue with defaults instead of crashing on NUL/broken JSON.
- Open:
  - Normal Chrome may require allowing Local Network Access/loopback for `https://shophuyvan-analytics.nghiemchihuy.workers.dev`; HKCU Chrome policy write was denied by Windows policy.
  - `E:\shophuyvan-python-automation\oms_python\features\chat\automation_browser.py` remains a legacy >30KB file; this hotfix only removed minimized launch paths. Split requires a dedicated automation refactor pass.
- Deploy:
  - Chat Worker `shophuyvan-chat-api` deployed version `9cabb70f-861c-41c7-a97e-d811679b75de`.
  - Static `shophuyvan-analytics` deployed final version `05fde6f3-613b-49ce-8692-d14c1cd705c6`.
- Verify:
  - `GET https://shophuyvan-chat-api.zacha030596.workers.dev/api/chat/settings`: `automation_browser_preset=compact`, `620x480`, hidden `false`.
  - `POST /api/chat/settings` with current automation browser settings: pass and readback unchanged.
  - Production `/settings?v=verify-05fde6f3` desktop headless layout: automation card visible, `compact/620`, `overflowX=false`, generic `Failed to fetch` absent.
  - Local helper `GET http://127.0.0.1:8794/api/automation/slots`: port `8794`, slots `9241/9242 ok=true`, scheduler running, `autoSendEnabled=false`, `localAiReplyEnabled=false`, `autoWelcomeOnNewFriend=false`, `autoGreetOnFirstInbound=false`, bridge configured.
- Tests:
  - `python -m py_compile` for changed automation runtime/chat/report/TikTok files.
  - `node --check` for changed Chat Worker, FE settings/chat files, and Zalo local helper files.
  - `npm run check` in `apps/chat-worker-api`.
  - `node scripts/test-ui-design-system-guard.mjs --files ...` passed.
  - ECC hook `after-edit` passed.
- Endpoint report:
  - Checked/used: Chat Worker `/api/chat/settings`, local helper `/chat-sync`.
  - Missing permission/token: none in code path; deploy auth still must be verified before publish.
  - Endpoint not available: none.
  - Fallback: hidden/headless mode intentionally not supported by guard; compact visible window is the supported low-impact mode.

### 2026-06-04 - External Product Core API now returns content + full images

- Scope:
  - `apps/worker-api/src/core/external/product-core.js`
  - `apps/worker-api/src/core/external/shopee-product-core.js`
  - `apps/worker-api/src/features/shopee/api/product.js`
  - `apps/worker-api/src/routes/external/index.js`
  - `docs/facebook-crm-api.md`
  - `scripts/test-external-shopee-product-core.mjs`
- User clarification:
  - Final source for prompt/video generation should be internal `Product Core` data, not direct Shopee read as the main path.
- Done:
  - `GET /api/external/products` now returns `description`, `imageUrl`, `images[]`, `promptAssets.allImageUrls`, `promptAssets.promptText`.
  - `GET /api/external/products/:id` keeps Product Core detail and now returns the same content/image fields with `variants[]`.
  - `GET /api/external/products/sku/:sku` also returns the same content/image fields for direct SKU lookup.
  - Kept the new Shopee direct-read endpoints available under `/api/external/shopee/products/full*` for API-capable shops, but they are not required for the user's Product Core flow.
- Root cause fixed during production verify:
  - First production readback on the new Shopee direct-read path exposed wrong `item_id_list` encoding for `get_item_base_info/get_item_extra_info`; fixed from bracketed payload to comma-separated payload and redeployed.
- Deploy:
  - Main Worker `huyvan-worker-api` deployed from `apps/worker-api`.
  - Cloudflare account: `nghiemchihuy@gmail.com` / `efe50fab1dd644088d681fb14a4838ae`.
  - Final worker version: `add5e98d-6ade-44ad-9599-9b58b67d4081`.
- Production verify:
  - `GET /api/external/products?limit=1` with real external API key: pass.
  - `GET /api/external/products/:id` with returned `id`: pass.
  - Verified response now includes `images[]` and `promptAssets`.
  - Sample readback on production: first product returned `images=1`, detail returned `variants=1`, `promptAssets.promptText` present.
  - Sample product had `description_len=0`; this is source data state, not an API failure.
- Tests:
  - `node --check apps/worker-api/src/core/external/product-core.js`
  - `node --check apps/worker-api/src/core/external/shopee-product-core.js`
  - `node --check apps/worker-api/src/routes/external/index.js`
  - `node scripts/test-external-shopee-product-core.mjs`
  - ECC hook `before-edit`, `after-edit` passed for this phase.
- Endpoint report:
  - Checked/used: `GET /api/external/products`, `GET /api/external/products/:id`, `GET /api/external/products/sku/:sku`, Shopee `/api/v2/product/get_item_list`, `/api/v2/product/get_item_base_info`, `/api/v2/product/get_item_extra_info`, `/api/v2/product/get_model_list`.
  - Missing permission/token: none for this run.
  - Endpoint not available: none in this scope.
  - Fallback: none for Product Core flow.

### 2026-06-03 - Chat AI guarded auto-send readiness deployed

- Scope: `apps/chat-worker-api/src/core/ai-agent-evidence-core.js`, `apps/chat-worker-api/src/core/ai-policy-core.js`, `apps/chat-worker-api/src/core/sync-core.js`, `apps/fe/js/dashboard/chat/*.js`, `apps/fe/css/dashboard/chat.css`, `apps/fe/pages/chat-cskh.html`, `scripts/test-chat-ai-policy.mjs`.
- Issue fixed:
  - Backend scheduled AI auto-reply no longer sends blindly when production is in safe mode.
  - AI suggestion response now returns `auto_send_readiness` with `suggestion_id`, delay seconds, visible countdown requirement, and cancel-on-customer-message requirement.
  - Chat composer now has a guarded auto-send countdown shell that can be canceled by operator edit, conversation switch, or new customer message.
  - Production remains locked to `suggest_only`; current Chat AI can draft only, not auto-send.
- Deploy:
  - Chat Worker `shophuyvan-chat-api` deployed from `apps/chat-worker-api`, Cloudflare account `zacha030596@gmail.com` / `39cf0fe9b3eda88bda53e369770cabeb`.
  - Chat Worker version: `681fc9c6-a396-4f7f-a427-1a690b353d72`.
  - Static `shophuyvan-analytics` deployed from root account `nghiemchihuy@gmail.com` / `efe50fab1dd644088d681fb14a4838ae`.
  - Static versions: `87af4f42-bda8-43ac-ba1f-a979c0755f0a`, then final HTML meta cleanup version `708784cb-a7e7-481f-a133-5cf14a4ab1f2`.
  - Main Worker `huyvan-worker-api` was not deployed in this step.
- Production verify:
  - `GET /api/chat/settings`: `ai_mode=suggest_only`, `allow_auto_send=false`, `chat_ai_agent_config.mode=suggest_only`.
  - `GET /api/chat/ai/status`: `ai_status=active`, Gemini key count `2`.
  - `POST /api/chat/ai/suggest` on a real Lazada bridge conversation returned `auto_send=false`, `auto_send_readiness.eligible=false`, `requires_visible_countdown=true`, `cancel_on_customer_message=true`; test suggestion was rejected after readback.
  - Chrome/CDP `127.0.0.1:9333` on production `/pages/chat-cskh?v=chat-auto-send-20260603a&verify=708784cb`: clicked `Gợi ý AI`; composer received an AI draft and evidence, shop message count stayed unchanged, countdown was not shown, no `Failed to fetch`, no sending state.
  - Responsive readback after final deploy: desktop `1366x900`, tablet `820x1180`, mobile `390x844` all `overflowX=false`, composer/AI/send buttons visible, no console warning/error.
- Tests pass:
  - `node --check` for changed Chat Worker core files and changed Chat frontend files.
  - `node scripts/test-chat-ai-policy.mjs`.
  - `npm run check` in `apps/chat-worker-api`.
  - `node scripts/test-ui-design-system-guard.mjs --files apps/fe/js/dashboard/chat/auto-send.js apps/fe/js/dashboard/chat/events.js apps/fe/js/dashboard/chat/render.js apps/fe/pages/chat-cskh.html`.
  - ECC hook `before-edit`, `after-edit` pass for code/docs edits in this phase.
- Open guard:
  - Do not enable backend scheduled auto-send unless `CHAT_AI_BACKEND_AUTO_SEND` or `CHAT_AI_BACKEND_AUTO_REPLY` is explicitly enabled and settings are `allow_auto_send=true` + `chat_ai_agent_config.mode=auto_send_guarded`.
  - Do not enable Zalo/Facebook auto-send until the same visible countdown, cancel, evidence, bridge send-result audit, and production click-flow are verified on those channels.
- Endpoint report:
  - Checked/used: Chat Worker `/api/chat/settings`, `/api/chat/ai/status`, `/api/chat/ai/suggest`, `/api/chat/ai/reject`; static `/pages/chat-cskh`.
  - Missing permission/token: none.
  - Endpoint not available: none in this scope.
  - Fallback: none; this is internal Chat Core and browser-verified production UI.

### 2026-06-03 - Chat AI safe-mode backend deployed

- Scope: `apps/chat-worker-api/src/core/ai-settings-defaults.js`, `apps/chat-worker-api/src/core/conversation-core.js`, `apps/fe/js/dashboard/chat-settings.js`, `scripts/test-chat-ai-policy.mjs`.
- Resolved deploy blocker: Wrangler OAuth now uses Cloudflare account `zacha030596@gmail.com` / `39cf0fe9b3eda88bda53e369770cabeb`.
- This section supersedes the older blocked/deploy-pending note in the historical entry below.
- Deploy:
  - Chat Worker `shophuyvan-chat-api` deployed from `apps/chat-worker-api`.
  - Version: `f6a05400-969d-4048-aeb0-2b776a2650c9`.
  - Static `shophuyvan-analytics` remains version `034d97f6-3755-46c1-8c44-a973477cb715` for the Settings UI status refresh patch.
  - Main Worker `huyvan-worker-api` was not deployed in this step.
- Production verify:
  - `GET /api/chat/ai/status`: `ai_status=active`, Gemini key count `2`.
  - `GET /api/chat/settings`: `ai_mode=suggest_only`, `allow_auto_send=false`, `chat_ai_agent_config.mode=suggest_only`, `zalo_reply_config.mode=suggest_only`.
  - `POST /api/chat/ai/test`: `ok=true`, `key_count=2`.
  - `POST /api/chat/ai/suggest` on a real Shopee bridge conversation: `provider=gemini`, `policy_status=needs_review`, `allowed_to_send=false`, `auto_send=false`, `send_capability=bridge`; the test suggestion was rejected after readback.
  - Production `/settings?v=chat-ai-backend-f6a05400` via Chrome CDP: AI active, saved `2/5` keys, `aiMode=suggest_only`, `allowAutoSend=false`, `agentMode=suggest_only`, `zaloMode=suggest_only`.
  - Clicked production `#testGeminiBtn`: toast returned `Gemini hoat dong tot. Da nhan 2/5 key.` and status stayed active.
  - Responsive readback: desktop `1366x900`, tablet `820x1180`, mobile `390x844` all `overflowX=false`.
- Tests pass:
  - `node --check apps/chat-worker-api/src/core/ai-settings-defaults.js apps/chat-worker-api/src/core/conversation-core.js apps/fe/js/dashboard/chat-settings.js`.
  - `node scripts/test-chat-ai-policy.mjs`.
  - `npm run check` in `apps/chat-worker-api`.
- Open guard:
  - Do not start Phase 4 auto-send for Zalo or marketplace chat until countdown/cancel, policy gate, source evidence, send-result audit, and production click-flow are implemented and verified.
- Endpoint report:
  - Checked/used: Chat Worker `/api/chat/ai/status`, `/api/chat/ai/test`, `/api/chat/settings`, `/api/chat/ai/suggest`, `/api/chat/ai/reject`.
  - Missing permission/token: none after OAuth refresh.
  - Endpoint not available: none in this scope.
  - Fallback: none; this is internal Chat Core.

### 2026-06-03 - Chat AI safe-mode status refresh + production auto-send lock

- Phạm vi: `apps/chat-worker-api/src/core/ai-settings-defaults.js`, `apps/chat-worker-api/src/core/conversation-core.js`, `apps/fe/js/dashboard/chat-settings.js`, `scripts/test-chat-ai-policy.mjs`.
- Vấn đề kiểm lại từ handoff:
  - Production `/api/chat/ai/status` từng rơi về `fallback` dù đã có 2 Gemini key.
  - DB cũ còn `ai_mode=auto_send_guarded` và `allow_auto_send=true` trong khi cấu hình agent mới đang `suggest_only`.
  - Nút `Kiểm tra kết nối` ở Settings test Gemini xong nhưng không reload trạng thái nên người vận hành vẫn có thể thấy status cũ.
- Đã sửa code:
  - Backend normalize settings chỉ cho `allow_auto_send=true` khi `chat_ai_agent_config.mode=auto_send_guarded`; nếu agent đang `suggest_only` hoặc `reviewed_auto_ready` thì ép `ai_mode=suggest_only`, `allow_auto_send=false`.
  - `saveChatSettings()` không override ngược lại khóa normalize này.
  - Settings UI gọi `loadAll()` sau khi test Gemini để đọc lại status thật từ Chat Worker.
  - Regression `scripts/test-chat-ai-policy.mjs` khóa case DB cũ có `allow_auto_send=true` nhưng agent `suggest_only`.
- Deploy/production:
  - Static `shophuyvan-analytics` đã deploy version `034d97f6-3755-46c1-8c44-a973477cb715`; upload `js/dashboard/chat-settings.js`.
  - Chat Worker code patch chưa deploy được vì token/profile `shophuyvan-chat-api` trong `profiles.local.json` không xác thực với Wrangler; không deploy bằng token account chính `efe50...` vì Chat Worker yêu cầu account `39cf...`.
  - Đã khóa production settings trực tiếp qua `POST /api/chat/settings`: `ai_mode=suggest_only`, `allow_auto_send=false`, `chat_ai_agent_config.mode=suggest_only`, `zalo_reply_config.mode=suggest_only`.
- Verify production:
  - `/api/chat/ai/test` bằng key đã lưu trả `ok=true`, `key_count=2`, `active_key_position=1`; `/api/chat/ai/status` trả `ai_status=active`.
  - `/api/chat/settings` readback trả `allow_auto_send=false`, `agent_mode=suggest_only`, `zalo_mode=suggest_only`.
  - AI suggest trên hội thoại Shopee bridge thật trả `provider=gemini`, `ai_status=active`, `policy_status=needs_review`, `allowed_to_send=false`, `auto_send=false`, `send_capability=bridge`; suggestion test đã reject để không để lại nháp dùng thật.
  - Chrome/CDP profile thật `127.0.0.1:9333` mở `/settings?v=chat-ai-safe-20260603b`: status `AI đang hoạt động tốt`, `Đã lưu 2/5 key`, `aiMode=suggest_only`, `allowAutoSend=false`, `agentReplyMode=suggest_only`, desktop `overflowX=false`; bấm `Kiểm tra kết nối` trả `Gemini hoạt động tốt. Đã nhận 2/5 key.` và status vẫn active.
- Test pass:
  - `node --check` các file đã sửa.
  - `node scripts/test-chat-ai-policy.mjs`.
  - `npm run check` trong `apps/chat-worker-api`.
  - `node scripts/test-ui-design-system-guard.mjs --files apps/fe/js/dashboard/chat-settings.js`.
  - ECC hook `after-edit` và `before-final` pass.
- Còn mở:
  - Cần token Cloudflare hợp lệ cho profile `shophuyvan-chat-api` account `39cf0fe9b3eda88bda53e369770cabeb` để deploy backend guard vừa patch.
  - Đã thử OAuth Wrangler cho Chat Worker ngày 2026-06-03: OAuth hoàn tất nhưng chỉ trả account `efe50fab1dd644088d681fb14a4838ae`, không có account Chat Worker `39cf0fe9b3eda88bda53e369770cabeb`; vẫn chưa được deploy Chat Worker.
  - Không mở Phase 4 auto-send Zalo/Chat cho đến khi có countdown/cancel, policy gate, evidence và audit gửi thật.
- Endpoint/marketplace:
  - Đã dùng: Chat Worker `/api/chat/ai/test`, `/api/chat/ai/status`, `/api/chat/settings`, `/api/chat/ai/suggest`, `/api/chat/ai/reject`.
  - Thiếu quyền/token: Cloudflare deploy token cho Chat Worker profile không xác thực với Wrangler.
  - Không có endpoint: không phát sinh.
  - Fallback: không dùng Seller Center fallback; đây là Chat Core nội bộ.

### 2026-06-02 - Chat AI Agent Settings phase 1 (central training UI, Zalo auto-send locked)

- Phạm vi: `apps/fe/settings.html`, `apps/fe/js/dashboard/chat-settings.js`, `apps/fe/js/dashboard/chat-settings-agent.js`, `apps/fe/css/dashboard/chat-settings.css`, `docs/chat-ai-agent-core-integration-plan.md`.
- Vấn đề user báo:
  - Cấu hình tự trả lời/AI nằm rời rạc, khó biết AI đang học gì và vì sao trả lời sai.
  - Zalo từng có phản hồi tự động không liên quan; cần đưa cấu hình trả lời và train AI lên page Settings thay vì chỉnh mỗi nơi một kiểu.
- Đã sửa:
  - Thêm block `Huấn luyện AI CSKH` trong `/settings` để cấu hình vai trò trả lời, nguồn dữ liệu được dùng, độ chắc chắn, quy tắc chuyển nhân viên và thời gian chờ nếu sau này bật tự gửi.
  - Lưu cấu hình mới qua `/api/chat/settings` bằng key `chat_ai_agent_config`; Zalo vẫn dùng `zalo_reply_config`.
  - Khi lưu, `ai_learning_notes` được build lại bằng hai section quản lý: `AI CSKH - luật vận hành` và `Zalo - cách trả lời riêng`, giúp AI dùng đúng bối cảnh mà không tự học hội thoại thô.
  - Tách logic AI/Zalo settings sang `apps/fe/js/dashboard/chat-settings-agent.js`; `chat-settings.js` giảm xuống dưới 30KB.
  - Vẫn ép Zalo local helper giữ `autoWelcomeOnNewFriend=false` và `autoGreetOnFirstInbound=false`; auto-send Zalo chưa được bật trong phase này.
  - Thêm `docs/chat-ai-agent-core-integration-plan.md` để chốt hướng tích hợp agent CSKH theo các phase tiếp theo.
- Kết quả kỹ thuật:
  - `node --check apps/fe/js/dashboard/chat-settings.js` pass.
  - `node --check apps/fe/js/dashboard/chat-settings-agent.js` pass.
  - `node scripts/test-chat-ai-policy.mjs` pass.
  - `node scripts/test-chat-ai-context.mjs` pass.
- Deploy: FE static `shophuyvan-analytics` version `7a30bba9-276e-478a-9599-a827854c4912`.
- Verify:
  - Local `/settings.html`: mở tab AI, lưu `Huấn luyện AI CSKH`, readback `chat_ai_agent_config`, `ai_learning_notes` có đủ section AI CSKH + Zalo.
  - Production `/settings?v=chat-ai-agent-20260602a`: save/readback pass, `agentMode=suggest_only`, `raw_conversation_learning=false`, Zalo vẫn `suggest_only`.
  - Production tab `Kênh chat`: helper cổng `8794` đang nối Chat chung, `AI trên máy=Đang tắt`, `Bộ gửi tự động=Đang tắt`, safe mode bật.
  - Responsive production: mobile/tablet/desktop không tràn ngang; console errors/warnings = 0.
- Endpoint report:
  - Đã kiểm/đã dùng: `GET/POST /api/chat/settings` (Chat Worker settings JSON).
  - Thiếu quyền/token: không phát sinh.
  - Không có endpoint: không phát sinh.
  - Fallback: không dùng Seller Center fallback.

### 2026-06-01 - Order push iPhone: mo lai luong notify tu Order Core sang Chat push subscriptions

- Pham vi: `apps/worker-api/src/routes/marketplace-chat/index.js`, `apps/fe/js/dashboard/chat/notifications.js`, `apps/fe/js/dashboard/chat-settings.js`.
- Van de xac nhan:
  - Order sync/import van goi `notifyOrderSubscribers(...)` nhung nhanh nay bi hard-disable (`legacy_chat_notifications_disabled`), nen khong co push order gui ra iPhone.
  - Frontend ton tai 2 duong dang ky service worker (`/sw.js` va `/service-worker.js`) de gay lech scope/runtime khi iPhone nhan push.
- Da sua:
  - Thay `notifyOrderSubscribers` tu stub disabled thanh bridge goi Chat Worker `POST /api/chat/notifications/test` voi payload `type=order`, `title/body`, `order_id/order_ids`, `url=/pages/oms-dashboard.html`.
  - Giu guard batch: khi `deliver_now=false` tra `skipped` ro rang, khong gia bao da gui.
  - Chuan hoa dang ky push ben Chat UI sang `/sw.js` de dong nhat service worker runtime.
- Ket qua ky thuat:
  - Luong `order changed -> notifyOrderSubscribers -> chat push endpoint` da co duong chay thuc.
  - Payload order co du truong hien thi (`title`, `body`) de service worker render thong bao.
- Endpoint report:
  - Da kiem: `POST /api/chat/notifications/test` (Chat Worker), cac callsite order sync/import goi `notifyOrderSubscribers`.
  - Da dung: bridge tu Worker API sang Chat Worker notifications test endpoint.
  - Thieu quyen/token: chua phat sinh `api_permission_missing`/`token_scope_missing` trong luot local verify.
  - Khong co endpoint: khong phat sinh `endpoint_not_available` cho scope nay.
  - Fallback: khong dung Seller Center fallback.
- Deploy: chua deploy trong luot nay.
- Verify:
  - `node --check` pass cho file backend/frontend da sua.
  - Script guard: `node scripts/test-order-core-guard.mjs` pass.
  - Hook bridge: `before-edit` + `after-edit` pass.
- Con mo:
  - Chua verify production iPhone lock-screen/banner/notification-center vi chua deploy va chua chay click-flow thuc te tren thiet bi.
  - Can test quyen iOS Notifications o trang thai Safari Home Screen + app permissions de chot end-to-end.
### 2026-05-31 - Flash Sale đã bật và đã có sản phẩm (verify API thật + cleanup dứt điểm)

- Tiếp tục xử lý production cho shop Shopee `chihuy1984` bằng admin token thật (profile đang đăng nhập).
- Đã deploy Worker production mới nhất: `huyvan-worker-api` version `e99fe8bb-d975-4a8e-92f5-e1404ff846fa`.
- Verify live-write thật:
  - `POST /api/discounts/flash-auto/run` với `force_submit=true` trả `live_write_sent=true`.
  - Lần chạy thực tế ghi nhận `items_submitted=2` rồi `items_submitted=3` (không còn fail `exceed the max number of item limit per promotion`).
- Verify readback item thật theo timeslot:
  - `timeslot_id=274064460034049` -> `flash_sale_id=277906811600896` -> readback `2` item.
  - `timeslot_id=274064460038146` -> `flash_sale_id=277906845151232` -> readback `2` item.
  - `timeslot_id=274064460034050` -> `flash_sale_id=277921302921216` -> readback `6` item.
  - `timeslot_id=274117308268544` -> `flash_sale_id=277919142854656` -> readback `7` item.
  - `timeslot_id=274147511451648` -> `flash_sale_id=277733389709312` -> readback `8` item.
- Dọn chương trình lỗi 0 sản phẩm:
  - Từ read-model local có `28` record upcoming `item_count=0`; thử xóa thật trên sàn theo `delete_shop_flash_sale`: `2` ID xóa được, phần còn lại trả `shop_flash_sale_not_exist`.
  - Kết luận: phần lớn record 0 còn lại là cache bẩn/stale ở D1, không còn tồn tại trên Shopee.
  - Đã cleanup cache local bằng `POST /api/discounts/promotion-cache/delete` (`confirm=DELETE_CACHE_ONLY`) cho toàn bộ stale IDs.
  - Sau cleanup: `promotion-programs` local còn `5` upcoming và `0` record upcoming `item_count=0`.
- Kiểm chéo trực tiếp từ Shopee sync API:
  - `POST /api/discounts/shopee/promotions/sync` (module `shop_flash_sale`) trả `status=ok`.
  - Snapshot live từ sync: upcoming thực còn `5` chương trình, `0` chương trình upcoming bị `item_count=0`.
- Endpoint summary (phase này):
  - `Đã kiểm`: Shopee `get_shop_flash_sale_list`, `create_shop_flash_sale`, `add_shop_flash_sale_items`, `delete_shop_flash_sale`, `get_shop_flash_sale_items`.
  - `Đã dùng`: `create_shop_flash_sale`, `add_shop_flash_sale_items`, `delete_shop_flash_sale`, readback `get_shop_flash_sale_items`.
  - `Thiếu quyền/token`: không phát sinh `api_permission_missing` hoặc `token_scope_missing` trong lượt verify này.
  - `Không có endpoint`: Lazada Flash Sale family vẫn `endpoint_not_available` (không đổi so với phase trước).
- Trạng thái lỗi user báo:
  - Trước: bật Flash Sale nhưng nhiều chương trình không có sản phẩm.
  - Sau fix + verify: Flash Sale đã có sản phẩm readback thật trên Shopee API; cache rác local đã được dọn.
### 2026-05-31 - Dọn Flash Sale lỗi 0 sản phẩm trên Shopee (shop chihuy1984)

- Đã kiểm tra trực tiếp Shopee Open API `get_shop_flash_sale_list` (type=1/2/3): phát hiện nhiều chương trình `enabled_item_count=0`.
- Đã thực hiện xóa thực tế các chương trình lỗi ở nhóm vận hành hiện tại (type=1, enabled_item_count=0):
  - Tổng target: 24
  - Xóa thành công: 24
  - Lỗi: 0
- Đã kiểm tra lại sau khi xóa:
  - type=1 còn `1` chương trình
  - `0` chương trình type=1 bị 0 sản phẩm
  - chương trình còn lại có `enabled_item_count=1`
- Worker deploy đang chạy: `9bf6f3a5-9705-405a-96ea-20e1e6b2f8e5` (đã có guard `no_items_added` để chặn báo thành công giả).
### 2026-05-31 - Flash Sale 0 sản phẩm: chặn thành công giả khi Shopee từ chối toàn bộ item

- Đã fix `apps/worker-api/src/routes/discounts/flash-deal-endpoints.js`:
  - Parse `response.failed_items` từ `add_shop_flash_sale_items`.
  - Nếu số item/model được chấp nhận = 0 thì throw `no_items_added` thay vì coi là success.
  - Trả thêm metadata `accepted_units`, `failed_units`, `failed_items` cho engine.
- Đã fix `apps/worker-api/src/discounts/flash-auto-engine.js`:
  - `items_submitted` giờ ghi số item/model được Shopee chấp nhận thực tế (`accepted_units`), không còn ghi số submit request thô.
  - Message bổ sung thông tin số item/model bị Shopee từ chối.
- Deploy Worker production: `9bf6f3a5-9705-405a-96ea-20e1e6b2f8e5`.
- Kỳ vọng sau fix:
  - Nếu vẫn 0 sản phẩm, log/run sẽ báo lỗi rõ `no_items_added` hoặc message từ chối cụ thể từ Shopee thay vì "đã gửi".
  - Nếu có item pass, history sẽ phản ánh `items_submitted` đúng số được nhận.
### 2026-05-31 - Flash Sale gọi sàn thất bại: fix dứt điểm route timeslot + contract flash_sale_id

- Đã tiếp tục từ handoff dang dở Flash Sale và đọc đầy đủ AGENTS + core guards + docs bắt buộc + progress handoff.
- Đã fix backend `apps/worker-api/src/routes/discounts/flash-deal-endpoints.js`:
  - Chuẩn hóa contract item read/update/delete theo `flash_sale_id`; nếu chỉ có `timeslot_id` thì resolve qua `get_shop_flash_sale_list` trước khi đọc item.
  - Bổ sung guard admin cho `POST /api/discounts/flash-deal/items/add` (chặn gọi live-write trái quyền).
  - Bổ sung guard payload rỗng (`empty_item_payload`) để tránh gọi Shopee mutation khi không còn SKU hợp lệ.
  - Sửa nguyên nhân gọi sàn thất bại ở màn Flash Auto: route `/api/discounts/flash-deal/timeslots` nay tự cấp `start_time/end_time` hợp lệ (mặc định `now+120s` -> `+7 ngày`) nên không còn `shop_flash_sale_param_error`.
- Deploy Worker production liên tiếp sau mỗi vòng fix; version mới nhất: `e10ec7c9-1b21-4f04-8510-7473f1ec5af4`.
- Verify production API thật:
  - `GET /api/discounts/flash-deal/timeslots?shop=chihuy1984` trước fix: `400 shop_flash_sale_param_error`.
  - Sau fix/deploy: trả `200`, có danh sách `timeslots[]` hợp lệ.
  - `GET /api/discounts/flash-deal/items?...&timeslot_id=...` trả `missing_flash_sale_id` khi slot chưa có flash sale là đúng theo contract mới.
  - `POST /api/discounts/flash-auto/run` không auth trả `403 admin_required` (guard đúng, không còn mở route live-write công khai).
- Readback logs Flash Auto vẫn ghi nhận luồng live-write trước đó:
  - `GET /api/discounts/flash-auto/logs?shop=chihuy1984&limit=3` có bản ghi `live_write_sent=1`, `items_submitted=1`.
- Endpoint status sau khi kiểm Open Platform:
  - Shopee `shop_flash_sale/*`: có endpoint và đang dùng.
  - Lazada Flash Sale create/list/add/update/delete item: chưa có endpoint public -> `endpoint_not_available` (không fallback Seller Center trong phase này).
- Còn mở:
  - Chưa verify UI production desktop/tablet/mobile do môi trường hiện tại thiếu Playwright Chrome Extension nên không mở được session browser profile để bấm flow thật.
  - Cần verify thao tác UI `Chạy ngay` trực tiếp bằng profile `E:\codex-chrome-profiles\shophuyvan-test` khi extension/browser control sẵn sàng.
### 2026-05-30 - Flash Sale auto run-now: sửa lỗi gọi sàn thất bại và lệch shop

- Đã đọc đầy đủ AGENTS + toàn bộ core guards + docs bắt buộc, đồng thời resume từ handoff `docs/handoff/20260530-120142-promotions-ui-ux.md` để tiếp tục đúng ngữ cảnh Promotions/FlashSale.
- Đã vá frontend `apps/fe/js/dashboard/flash-auto.js`:
  - Chọn `currentShop` ưu tiên shop Shopee có API/token thay vì mặc định rơi vào shop Lazada.
  - Dừng retry sớm cho lỗi không thể thành công (`api_permission_missing`, `token_scope_missing`, `live_write_disabled`, shop chưa hỗ trợ, đang tắt, chưa có dữ liệu đủ điều kiện...), tránh lặp 6 lần vô nghĩa.
  - Sửa vòng polling `run-now` sang `await` tuần tự để không bị re-enable nút sớm và không chạy chồng nhiều polling.
  - Chuẩn hóa map trạng thái batch (`success/submitted/prepared/skipped`) để không gắn nhầm “thất bại”.
- Đã vá backend Worker API:
  - `apps/worker-api/src/routes/discounts/flash-auto-settings.js` và `flash-deal-endpoints.js`: không parse `request.json()` sớm ở wrapper (tránh ăn mất body route downstream).
  - `apps/worker-api/src/discounts/flash-auto-engine.js`: sửa fallback SQL tránh phát sinh cú pháp `v.''` gây 500; cập nhật xác nhận readback tương thích status số (`status=1`).
  - `apps/worker-api/src/routes/discounts/flash-auto-run.js`: bọc `runFlashAuto` bằng try/catch để trả lỗi có cấu trúc; cập nhật message summary batch có đếm `permission_denied`.
  - `apps/worker-api/src/routes/discounts/flash-deal-endpoints.js`: đổi adapter từ họ endpoint `flashdeal/*` sang `shop_flash_sale/*` cho time-slot/create/add/get-items (giảm nguy cơ `error_not_found` đã thấy ở production check).
- Kết quả check code:
  - `node --check` pass cho `flash-auto.js`, `flash-deal-endpoints.js`, `flash-auto-engine.js`, `flash-auto-run.js`, `flash-auto-settings.js`.
  - Không có mojibake trong file frontend đã sửa.
- Trạng thái deploy/verify:`n  - Đã deploy Worker production `huyvan-worker-api` version `0c7589cb-92f2-4d18-b24a-1f6e3d8865fb` -> `d3880c23-f932-45f8-a835-97005967a760` -> `b70fe800-7b2d-420b-a96e-b5e52a1ea5e3` (hotfix liên tiếp).`n  - Đã deploy static production `shophuyvan-analytics` version `61a5c7c1-00b8-4575-9fe8-b09a58701e95` (upload `js/dashboard/flash-auto.js`).`n  - Đã verify API production sau deploy: `POST /api/discounts/flash-auto/run/batch` shop `chihuy1984` không còn `error_not_found`, trả `status=prepared`, `timeslot_id=274064455839744`, `items_submitted=40`.`n  - Chưa verify UI production desktop/tablet/mobile bằng profile Chrome `E:\codex-chrome-profiles\shophuyvan-test` do môi trường Codex hiện tại thiếu Playwright Chrome Extension để mở phiên browser điều khiển.
- Còn mở:
  - `scripts/test-promotions-ui.mjs` đang fail do script kỳ vọng chuỗi version cũ của `promotions.html`; cần cập nhật test để làm quality gate hợp lệ trước khi chốt done.
  - Còn đồng tồn tại luồng legacy `/api/discounts/automation/*` và luồng mới `/api/discounts/flash-auto/*`; cần plan cleanup theo phase riêng để tránh drift.
### 2026-05-28 - Zalo local send bridge + social-channel policy

- Đã sửa lỗi Zalo bị coi là `manual_only` ở UI: Chat/CSKH nhận `channel=zalo` + `sync_capability=browser_helper` là bridge local, nút composer hiện `Gửi`, placeholder `Nhập tin nhắn cho khách...`, không còn banner `cần gửi tay`/`Lưu bản nháp`.
- Đã thêm endpoint local Zalo tool `POST http://127.0.0.1:8794/api/shophuyvan-chat/send`: map `shop_id` về profile Zalo, gửi bằng Chrome CDP visible/headful, chỉ trả `sent` sau khi `sendMessageViaTransport()` thành công, sau đó push/readback hội thoại về Chat Core qua `/api/chat/browser-helper/push`.
- Đã tách policy: Shopee/Lazada/TikTok vẫn chặn từ khóa/pattern kéo khách ra ngoài sàn; Zalo/Facebook trả `skip_reason=social_channel` và không áp dụng restricted keyword policy của chat sàn.
- Trang `settings.html` không còn báo `zalo: chưa cấu hình`; trạng thái mới là `zalo: helper local`, `facebook: social riêng`.
- File chuẩn đã sửa: `E:\tool zalo\server.js`, `E:\tool zalo\src\services\shophuyvanChatBridge.js`, `apps/fe/js/dashboard/chat/api.js`, `state.js`, `events.js`, `render.js`, `apps/fe/pages/chat-cskh.html`, `apps/fe/settings.html`, `apps/chat-worker-api/src/core/ai-policy-core.js`, `apps/chat-worker-api/src/routes/ai.js`, `scripts/test-chat-ai-policy.mjs`.
- Deploy production: Chat Worker `shophuyvan-chat-api` version `e2d8803c-b534-4581-bdd9-7fe7378365b4`; static `shophuyvan-analytics` version `46b0e809-2c05-4c54-a615-03612feafce9`. Không deploy Worker chính.
- Readback production: `/api/chat/policy/check` với `channel=zalo` + text có SĐT/Zalo trả `allowed=true`, `skipped=true`; cùng text với `channel=shopee` vẫn trả `allowed=false`, blocked `zalo` + `định dạng số điện thoại`.
- Local helper readback: `http://127.0.0.1:8794/api/automation/slots` trả `port=8794`, 2 slot Zalo connected, `autoSendEnabled=true`, `aiRuntimeReady=true`, `shophuyvanChatBridge.configured=true`.
- Production UI verification bằng Chrome profile thật: Settings desktop/tablet/mobile `overflowX=false`, Zalo helper local không còn chưa cấu hình; Chat/CSKH Zalo `Kỹ Thuật Hoàng Nhân` desktop/tablet/mobile `sendText=Gửi`, không còn manual draft/warn, `overflowX=false`.
- Chưa gửi live tin test mới cho khách trong lượt này để tránh gửi nhầm nội dung ngoài ý người vận hành; endpoint live-send đã kiểm route/validation và UI đã nối nút gửi thật.

### 2026-05-28 - Chat AI phase 2/3/4 auto-simple + log dữ liệu + duyệt học

- Đã hoàn tất phase 2/3/4: Gemini prompt dùng context Chat + Order/Product Core; auto-reply chỉ mở ở chế độ `auto_simple`; UI Chat/CSKH hiển thị bằng chứng AI đã dùng dữ liệu nào và có nút `Duyệt học`/`Hủy học`.
- File chuẩn đã sửa: `apps/chat-worker-api/src/core/ai-context-core.js`, `apps/chat-worker-api/src/core/ai-policy-core.js`, `apps/chat-worker-api/src/core/ai-knowledge-core.js`, `apps/chat-worker-api/src/routes/ai.js`, `apps/chat-worker-api/src/index.js`, `apps/chat-worker-api/wrangler.toml`, `apps/fe/js/dashboard/chat/render.js`, `apps/fe/js/dashboard/chat/events.js`, `apps/fe/css/dashboard/chat.css`, `apps/fe/pages/chat-cskh.html`, `scripts/test-chat-ai-context.mjs`, `scripts/test-chat-ai-policy.mjs`.
- Auto-send guard mới: chỉ `approved/auto_send=true` khi `CHAT_AI_MODE=auto_simple`, settings cho phép tự gửi, capability là `official_api/bridge`, intent là `order_status_simple` hoặc `product_info_simple`, có context Core tương ứng, không có `risk_flags`, không có warning đọc dữ liệu, và text pass policy từ khóa/pattern cấm.
- Các trường log trong `ai_suggestions.prompt_context`: `delivery_mode`, `simple_intent`, `order_context_count`, `product_context_count`, `order_codes`, `product_queries`, `core_context_warnings`, `context_risk_flags`. UI chỉ render bản tóm tắt nghiệp vụ, không lộ raw/debug.
- Learning flow: nhân viên gửi câu đã dùng gợi ý AI thì tự lưu vào `ai_knowledge_base`; nút `Duyệt học` lưu câu đang soạn vào knowledge; nút `Hủy học` gọi `/api/chat/ai/reject` và đặt `final_state=rejected`.
- Deploy production: Chat Worker `shophuyvan-chat-api` version `62809e20-a2d0-4f1f-a407-2c4212eb6ca9`; static `shophuyvan-analytics` version `59c78837-7637-4bda-8130-afa431ea3d59`; không deploy Worker chính.
- Production API readback: `/api/chat/ai/status` active, `gemini_key_count=2`; dry-run 3 hội thoại thật đều ở `mode=auto_simple` nhưng `auto_send=false` vì không đủ điều kiện simple hoặc có warning/risk; `/api/chat/ai/reject` trả `final_state=rejected`.
- Production UI verification bằng Chrome profile `E:\codex-chrome-profiles\shophuyvan-test`: `/pages/chat-cskh.html` desktop `1366x900`, tablet `820x1180`, mobile `390x844` pass `overflowX=false`, có evidence `AI đã soạn từ dữ liệu đã kiểm`, có `Duyệt học`/`Hủy học`, không lộ từ kỹ thuật thô, không mojibake. Artifact: `E:\shophuyvan-runtime\verification\chat-ai-phase234-20260528\summary-accepted.json`.
- Đã xử lý tiếp: Product Core search tên dài Lazada K75 đã hết warning/`worker_unhandled_error` sau Worker chính `204213c9-6b18-4b49-8c73-50712e17ec4c`; auto-simple vẫn chỉ gửi khi intent đủ rõ.

### 2026-05-28 - Chat AI Context Builder đọc Order/Product Core ở chế độ suggest-only

- Đã thêm lớp `buildAiReplyContext()` trong Chat Worker để dựng context sạch cho Gemini từ Chat Core + Worker Core, không cho AI tự đọc raw DB hoặc tự suy luận nghiệp vụ.
- File chuẩn đã sửa: `apps/chat-worker-api/src/core/ai-context-core.js`, `apps/chat-worker-api/src/core/ai-policy-core.js`, `scripts/test-chat-ai-context.mjs`, `scripts/test-chat-ai-policy.mjs`.
- Luồng dữ liệu: `chat_conversations/chat_messages` -> bắt mã đơn/SKU/tên sản phẩm -> `GET /api/core/orders/:orderId`, `GET /api/core/orders/by-conversation/:conversationId`, `GET /api/core/products/by-sku/:sku`, `GET /api/core/products/search` -> prompt Gemini có `orders/products/warnings/risk_flags`.
- Context builder chỉ giữ field vận hành an toàn như trạng thái đơn, vận chuyển, thanh toán, SKU, tên, giá, tồn; không đưa giá vốn/cost/raw payload vào prompt.
- Đã khóa phase này ở `CHAT_AI_MODE=suggest_only`: production có `allow_auto_send=true` và capability `bridge` vẫn chỉ trả `auto_send=false`, `policy_status=needs_review`, không gửi live bừa qua cron.
- Deploy production Chat Worker riêng `shophuyvan-chat-api` version `6021d457-6ab8-431a-9497-a057192f6fcc`; không deploy Worker chính và không deploy static UI.
- Production readback: `/api/chat/health` 200 D1, `/api/chat/ai/status` active với `gemini_key_count=2`; dry-run `/api/chat/ai/suggest` trên hội thoại Lazada `lazada_200166591213_200001352163_1_200166591213_2_103` trả `order_count=1`, `product_count=3`, `order_codes=["529065767452163"]`, `product_queries=["K75_MAUNAU5CM1M", ...]`, `auto_send=false`.
- Đã xử lý tiếp: Product Core search theo tên dài `Cuộn Ron Cửa... K75` trả `matched_product_core` và lookup SKU vẫn pass; không còn warning tên dài cho Chat AI context.
- Test pass: `npm run check` trong `apps/chat-worker-api`, `node scripts/test-chat-ai-context.mjs`, `node scripts/test-chat-ai-policy.mjs`, scoped mojibake scan vùng AI Chat. File đã chạm dưới 30KB; có script cũ `scripts/check-oms-core-regression-lock.mjs` >30KB ngoài phạm vi lượt này.
- Endpoint/marketplace: không thêm endpoint sàn mới; chỉ dùng route Core đọc an toàn của Worker chính. Shop có API đọc Order/Product Core qua API/snapshot hiện có; shop không API đọc dữ liệu đã nhập Warehouse/Core. Không phát sinh `api_permission_missing`, `token_scope_missing`, `endpoint_not_available`.

### 2026-05-28 - Chat policy chặn định dạng SĐT và website

- Đã chuyển chặn SĐT/domain thành policy hệ thống trong Chat Worker, không còn phụ thuộc người dùng tự thêm từng từ khóa. Pattern hiện chặn định dạng số điện thoại Việt Nam như `0909128999`, `090 912 8999`, `+84...`, `0084...` và domain/website như `shophuyvan.vn`, `www...`, `https://...`.
- File chuẩn đã sửa: `apps/chat-worker-api/src/core/ai-policy-core.js`, `apps/chat-worker-api/src/core/ai-settings-defaults.js`, `apps/chat-worker-api/src/routes/ai.js`, `apps/chat-worker-api/src/index.js`, `apps/fe/js/dashboard/chat/events.js`, `apps/fe/settings.html`, `scripts/test-chat-ai-policy.mjs`.
- Frontend Chat composer gọi `/api/chat/policy/check` trước khi optimistic append/gửi. Nếu bị chặn thì giữ nội dung trong ô nhập, hiện cảnh báo `Tin nhắn chứa nội dung bị cấm...`, không tạo bubble mới và không gọi route gửi tin.
- Trang `/settings` tab `Từ khóa cấm` hiển thị thêm chip hệ thống `định dạng số điện thoại`, `định dạng website`; preview dùng cùng policy backend nên test `0909128999 shophuyvan.vn` báo `Bị chặn`.
- Deploy production: Chat Worker `shophuyvan-chat-api` version `d5d674e4-7d2b-46e4-9cd8-b0beab88a969`; static `shophuyvan-analytics` version `95b003c3-efc4-4acb-adbf-cce91f8c6696`. Worker chính không deploy trong lượt này.
- Production readback: `POST /api/chat/policy/check` với `0909128999 shophuyvan.vn` trả `allowed=false`, `blocked_terms=["định dạng số điện thoại","định dạng website"]`; câu hợp lệ `Mã đơn 260525BY4BCTM7, tổng 90.000đ` trả `allowed=true`; response không trả `settings` hoặc secret marker.
- Production UI verification bằng Chrome profile thật `E:\codex-chrome-profiles\shophuyvan-test`: `/settings` và `/pages/chat-cskh` pass desktop `1366x900`, tablet `820x1180`, mobile `390x844`; `overflowX=false`; nhập và bấm gửi `0909128999 shophuyvan.vn` không append tin nhắn. Artifact: `artifacts/chat-policy-20260528/`.
- Endpoint/marketplace: không thêm endpoint sàn mới; chỉ dùng Chat Worker internal `/api/chat/policy/check`. Shop có API và shop không API đều bị chặn cùng một policy trước khi gửi/draft; không phát sinh `api_permission_missing`, `token_scope_missing`, `endpoint_not_available`.

### 2026-05-28 - Trang chủ thêm lối tắt Cài đặt Chat

- Đã thêm card `Cài đặt Chat` vào lưới `Truy cập nhanh` của trang chủ `/`, link thẳng tới `/settings` để chỉnh AI/Gemini, thông báo, từ khóa và cấu hình Chat thuận tiện hơn.
- File chuẩn đã sửa: `apps/fe/js/dashboard-home.js`, `apps/fe/index.html`. Đây là thay đổi static UI, không sửa Chat Worker, không đổi route backend và không thêm nguồn dữ liệu mới.
- Deploy production static `shophuyvan-analytics` version `355b02f9-ee19-470e-a7cc-7e78af8a5e61`; Wrangler chỉ upload `index.html` và `js/dashboard-home.js`.
- Production verification bằng Chrome CDP profile đang mở: `/` desktop `1440x900`, tablet `820x1180`, mobile `390x844` đều có card `Cài đặt Chat`, link `/settings`, `overflowX=false`, không có marker mojibake; bấm card mở được trang `Cài đặt Chat/AI` có Gemini. Artifact: `artifacts/home-chat-settings-20260528a/summary.json`.
- Endpoint/marketplace: không phát sinh endpoint sàn mới; không thay đổi Shopee/Lazada/TikTok capability. Shop có API và shop không API giữ nguyên luồng Chat Core hiện tại.

### 2026-05-28 - ADS Cài đặt tự động ROAS toàn chiến dịch và bật lại campaign

- Đã sửa lệch hướng UI: gỡ khỏi tab `Cài đặt` panel thao tác tay `Điều chỉnh chiến dịch thủ công`; màn này quay lại đúng vai trò cài đặt tự động ADS.
- Đã thêm setting tự động `ROAS mục tiêu áp dụng toàn bộ chiến dịch` (`roas_target`) và map ngược dữ liệu cũ `good_roas` -> `roas_target`, nên production hiện giữ đúng ROAS đang cấu hình `20` thay vì rơi về default `5.0`.
- Đã làm rõ và nối thật phần bật lại ADS: `auto_resume_enabled`, `resume_roas_multiplier`, `resume_stock_multiplier`, `max_resume_per_day`. Evaluation Engine chỉ đề xuất `resume` khi tự bật lại đang bật, ROAS vượt mục tiêu theo hệ số, tồn kho đủ và chưa chạm giới hạn bật lại trong ngày.
- File chuẩn đã sửa: `apps/fe/js/dashboard/ads.js`, `apps/fe/js/dashboard/ads/ads-end-user-ui.js`, `apps/worker-api/src/ads/evaluation-engine.js`, `apps/worker-api/src/routes/ads/index.js`, `scripts/test-ads-automation-engine.mjs`.
- Deploy production: Worker chính `huyvan-worker-api` version `661da300-3a63-4ff0-91c8-ea7ae1055c4c`; static UI `shophuyvan-analytics` version `9ddf1c73-03b7-44f1-8a72-de13bd7ec7c8`.
- Production verification bằng Chrome visible profile `E:\codex-chrome-profiles\shophuyvan-test`: tab `Cài đặt` không còn panel thủ công, `roasTargetInput=20`, có `.ads-resume-flow`, có toggle `auto_resume_enabled`, desktop `1440x900`, tablet `820x1180`, mobile `390x844` đều `overflowX=false`. Artifact: `E:\shophuyvan-runtime\verification\ads-redesign-20260528h\auto-settings-final-summary-r2.json`.
- Test pass: `node --check` các file JS đã sửa, `node scripts/test-ads-automation-engine.mjs`, `node scripts/test-ui-design-system-guard.mjs --files ...`. `scripts/test-ads-operations-ui.mjs` còn fail ở màn Khuyến mãi sàn thiếu nút quay về trang chủ, nằm ngoài phạm vi ADS và file promotions đang bẩn từ trước.
- Endpoint/marketplace: không thêm endpoint marketplace mới; chỉ dùng route Worker hiện có `/api/ads/automation/settings` và ADS automation engine. Shop có API vẫn đi Open Platform/Worker API; shop không API fallback giữ nguyên. Không phát sinh `api_permission_missing`, `token_scope_missing`, `endpoint_not_available`.
- Còn mở: nợ tách file lớn ADS (`ads-end-user-ui.js`, `ads-page.css`) vẫn còn; static deploy lần cuối cũng upload `js/dashboard/promotions-render.js` vì file này bẩn từ trước trong thư mục asset, không phải thay đổi của lượt ADS này.

### 2026-05-28 - ADS redesign Cài đặt/Cần xử lý/Lịch sử và chart 7 ngày

- Đã đổi tab ADS theo yêu cầu vận hành: `Luật tự động ADS` -> `Cài đặt`, `Nhật ký` -> `Lịch sử`, `Sản phẩm` -> `Cần xử lý`; tab Cài đặt chia flow 4 bước `Khung giờ`, `Điều kiện`, `Hành động`, `Giới hạn an toàn` và trạng thái hiện tại, không lặp nút chạy/tắt trong section con.
- Đã sửa Tổng quan: KPI nổi bật hơn, Top SKU ưu tiên không đè nút/huy hiệu, chart `Xu hướng 7 ngày` gọi riêng dữ liệu ADS 7 ngày gần nhất từ Core API thay vì bị kẹt theo filter hôm nay; production hiện đủ 05-22 -> 05-28 với chi ADS `280.392đ`, `384.360đ`, `365.022đ`, `369.516đ`, `203.035đ`, `271.101đ`, `89.031đ`.
- Đã sửa tab Cần xử lý: desktop table còn 8 cột hiển thị gồm `Sản phẩm`, `SKU`, `Shop`, `Tồn`, `Chi ADS`, `ROAS / ACOS`, `Trạng thái`, `Hành động`; row danger/watch có màu nền, mobile card có tooltip ROAS/ACOS.
- File chuẩn đã sửa: `apps/fe/pages/ads.html`, `apps/fe/css/ads/ads-page.css`, `apps/fe/js/dashboard/ads.js`, `apps/fe/js/dashboard/ads/ads-end-user-ui.js`. Frontend chỉ render/call Worker API read-model ADS, không thêm nguồn dữ liệu thứ hai và không tự tính nghiệp vụ ngoài dữ liệu Core trả về.
- Deploy production static `shophuyvan-analytics` version cuối `ba350301-eb6e-4003-bc95-d328c1668942`; Worker API không đổi trong lượt UI này.
- Test pass: `node --check apps/fe/js/dashboard/ads/ads-end-user-ui.js`, `node --check apps/fe/js/dashboard/ads.js`, `node scripts/test-ui-design-system-guard.mjs`, scoped UTF-8 marker check, `git diff --check` scope ADS chỉ còn cảnh báo CRLF.
- Production verification bằng Chrome visible profile `E:\codex-chrome-profiles\shophuyvan-test`: desktop `1440x900`, tablet `820x1180`, mobile `390x844` đều `overflowX=false`, tab đúng `Tổng quan/Cần xử lý/Cài đặt/Lịch sử`, chart `trendCount=7`, `trendMissing=0`, Top SKU `cardOverlapCount=0`, Cài đặt `stepCount=8`, `heroActionCount=3`, `statusActionCount=0`, tooltip mở được cả desktop/tablet/mobile. Artifact: `E:\shophuyvan-runtime\verification\ads-redesign-20260528g\`.
- Endpoint/marketplace: không thêm endpoint marketplace mới, không live-write ADS; đã dùng route hiện có `/api/ads/dashboard`, `/api/ads/campaign-guard/overview`, `/api/ads/automation/*`. Shop có API vẫn đi Open Platform/Worker API hiện có; shop không API không đổi fallback. Không phát sinh `api_permission_missing`, `token_scope_missing`, `endpoint_not_available`.
- Còn mở: `apps/fe/js/dashboard/ads/ads-end-user-ui.js` vẫn vượt 30KB và `apps/fe/css/ads/ads-page.css` sát/vượt ngưỡng; đây là nợ tách module ADS đã có từ trước, cần lượt refactor riêng vì worktree đang có nhiều thay đổi bẩn ngoài scope.

### 2026-05-28 - Chat/CSKH AI settings panel nối HTML redesign

- Đã nối lại panel `Cài đặt AI` theo file mẫu `C:/Users/Admin/Downloads/VÒI HOA SEN/caidat_ai_panel_redesign.html`: layout compact, có khối `Kết nối AI`, `Mô hình và luật tự động`, `Quyền hạn AI`, quản lý từ khóa, bộ nhớ kiến thức và thanh lưu.
- Đã thêm nút rõ ràng `Lưu API Gemini` ngay dưới ô `API Gemini xoay vòng`; nút này gọi `POST /api/chat/settings` của Chat Worker, không ghi key giả khi ô key trống, và sau khi lưu hiện `Đã lưu API Gemini.` ngay trên màn hình.
- Đã sửa các chuỗi tiếng Việt bị lỗi dấu còn sót trong Chat module (`trạng thái`, `khác`, `Giá`) và quét scope Chat không còn marker mojibake `Ã/áº/Ä/â€`.
- File chuẩn đã sửa: `apps/fe/js/dashboard/chat/detail-panels.js`, `apps/fe/js/dashboard/chat/events.js`, `apps/fe/js/dashboard/chat/context.js`, `apps/fe/css/dashboard/chat-ai-settings.css`, `apps/fe/pages/chat-cskh.html`; frontend vẫn chỉ render/form và gọi Chat Worker, không tự xử lý nghiệp vụ Chat Core.
- Deploy production static `shophuyvan-analytics` version cuối `05177fc1-9210-4536-b8bf-8a49b4b8ce72`; Chat Worker không deploy lại ở bước UI này vì API settings đã có sẵn và production trả `204/200` khi lưu.
- Test pass: `node --check` các module Chat đã sửa, `node scripts/test-ui-design-system-guard.mjs`, kiểm cache-bust `chat-ai-settings-20260528f`, kiểm UTF-8/mojibake scope Chat sạch.
- Production verification bằng Chrome thật: Chat/CSKH desktop `1920x1080`, tablet `820x1180`, mobile `390x844` đều có `Lưu API Gemini`, `aiGeminiKeys`, keyword manager, `Lưu cài đặt AI`, không tràn ngang document/detail, không lỗi font; desktop bấm `Lưu API Gemini` trả `POST /api/chat/settings=204` rồi `GET=200`, toast/state hiện `Đã lưu API Gemini.`. Artifact: `artifacts/chat-core/ai-panel-20260528f/`.
- Endpoint/marketplace: không phát sinh endpoint sàn mới; đã dùng Chat Worker `/api/chat/settings`. Shopee/Lazada/TikTok chat capability và bridge giữ nguyên theo Chat Core, không đổi fallback shop không API.

### 2026-05-28 - Thêm Skill UI Master Prompt

- Đã tạo skill `shophuyvan-ui-master-prompt` tại `C:\Users\Admin\.codex\skills\shophuyvan-ui-master-prompt\SKILL.md`; nội dung gốc từ `docs/shophuyvan-ui-master-prompt .md` được lưu nguyên trong `references/ui-master-prompt.md` để bắt buộc đọc đầy đủ trước khi sửa UI/UX.
- Đã thêm tham chiếu vào `AGENTS.md`: bảng Routing Skill có dòng UI/UX/layout/responsive/settings panel dùng `shophuyvan-ui-master-prompt`; mục UI Responsive yêu cầu đọc skill này cùng `shophuyvan-ui-design-system-guard`.
- Test pass: `quick_validate.py` cho skill mới; kiểm UTF-8 bằng Node cho `SKILL.md`, `agents/openai.yaml`, `references/ui-master-prompt.md`, `AGENTS.md` và docs trong phạm vi cập nhật. Không deploy vì đây là thay đổi guard/local skill và tài liệu, không thay đổi runtime production.
- Còn mở: các lỗi UI/UX Chat/CSKH trên production vẫn cần lượt code riêng và khi sửa phải đọc skill mới này cùng các guard UI còn lại.

### 2026-05-28 - Thêm Skill Chat Core Guard

- Đã tạo skill `shophuyvan-chat-core-guard` tại `C:\Users\Admin\.codex\skills\shophuyvan-chat-core-guard\SKILL.md` để bắt buộc kiểm ranh giới Chat Worker, route `/api/chat/*`, capability, dedupe, read-state, AI safety filter và deploy đúng profile trước khi sửa Chat/CSKH.
- Đã thêm tham chiếu vào `AGENTS.md`: bảng Routing Skill có dòng Chat/CSKH dùng `shophuyvan-chat-core-guard`; mục Chat Sàn yêu cầu đọc skill này cùng core-first/label-tracking guard.
- Test pass: `quick_validate.py` cho skill mới; kiểm UTF-8 bằng Node cho skill và metadata UI không có mojibake. Không deploy vì đây là thay đổi guard/local skill và tài liệu, không thay đổi runtime production.
- Còn mở: các lỗi UI Chat/CSKH đang thấy trên production vẫn cần xử lý ở lượt code riêng; skill này chỉ khóa quy trình để lần sửa Chat sau không vá sai ranh giới Core.

### 2026-05-27 - ADS rule settings UI cleanup

- Đã chỉnh giao diện tab `Luật tự động ADS` để phần cài đặt dễ đọc hơn: label/input/đơn vị được căn theo grid, input dùng nền tối theo design system thay vì ô trắng native, tiêu đề card và text cấu hình lớn/rõ hơn, khoảng cách giữa các rule card gọn hơn.
- File chuẩn đã sửa: `apps/fe/css/ads/ads-page.css`, `apps/fe/pages/ads.html`. Frontend vẫn chỉ render cấu hình/read-model ADS hiện có, không thêm logic nghiệp vụ, không tự tính ngoài Core và không thêm nguồn dữ liệu thứ hai.
- Deploy production static `shophuyvan-analytics` version `75e2e11a-4b10-4372-9262-2ca4d1c37ff2`; Worker API không đổi trong lượt UI này. Lần deploy cuối chỉ upload `pages/ads.html` và `css/ads/ads-page.css`.
- Kiểm thật bằng Chrome visible profile `E:\codex-chrome-profiles\shophuyvan-test`: mở production `/pages/ads`, vào `Luật tự động ADS`, kiểm đúng hai cụm user khoanh `Điều kiện đánh giá` và `Giới hạn an toàn` trên desktop `1366x900`, tablet `820x1180`, mobile `390x844`; tất cả pass, `overflowX=0`, không login wall, không console issue, CSS cache-bust `ads-rules-layout-20260527b` đã tải.
- Artifact kiểm UI: `tmp-verification/ads-rules-ui-20260527-final/result.json` và ảnh `desktop/tablet/mobile` cho `conditions` + `safety`.
- Test pass: `node scripts/test-ui-design-system-guard.mjs`, `node --check apps/fe/js/dashboard/ads/ads-end-user-ui.js`, `git diff --check` cho 2 file ADS chỉ còn cảnh báo CRLF, kiểm mojibake trên 2 file ADS không có kết quả.
- Endpoint/marketplace: không phát sinh endpoint mới, không live-write, không đổi allowlist/quyền/token; shop có API vẫn đi ADS/Open Platform/Worker route hiện có, shop không API không thay đổi fallback.
- Còn mở: `apps/fe/js/dashboard/ads/ads-end-user-ui.js` đang vượt 30KB từ trước và chưa tách trong lượt UI CSS này vì không chỉnh logic JS; cần audit/tách module ở lượt riêng. Worktree có nhiều file bẩn sẵn ngoài scope nên không stage/stash/revert để tránh đụng thay đổi không rõ owner.

### 2026-05-27 - Chat/CSKH AI settings, keyword guard và thông báo nền

- Đã mở rộng tab `Cài đặt AI` thành workspace đủ chỗ cho bộ nhớ kiến thức, luật an toàn, từ khóa hạn chế và `API Gemini xoay vòng`; form có `Lưu từ khóa`, `Lưu cài đặt AI`, `Nạp mặc định`, `Nạp chính sách sàn`.
- Chat Worker lưu AI settings an toàn: seed mặc định gồm `shopee`, `lazada`, `tiktok`, `zalo`, `facebook`, `web`, `sdt` và nhóm chửi thề; response `/api/chat/settings` không trả raw `gemini_api_keys`, chỉ trả `gemini_api_key_count`.
- Gemini support đã nối backend: nhận tối đa 5 key, xoay vòng theo `gemini_key_cursor`, test qua `/api/chat/ai/test`; nếu key lỗi/chậm thì thử key kế tiếp và vẫn giữ chế độ gợi ý an toàn, không tự gửi khi policy chặn.
- Luật gửi tin đã khóa ở Chat Worker trước khi lưu/gửi: text chứa từ khóa hạn chế trả `status=blocked_by_restricted_keyword`, `error_code=restricted_keyword_blocked`; production test gửi payload chứa `zalo` bị chặn trước adapter, không gửi lên sàn.
- Công tắc `Thông báo` trên topbar đã đổi từ nút bấm sang switch có trạng thái `Đang tắt/Đang bật/Bị chặn`; khi bật sẽ xin quyền Notification theo thao tác người dùng, đăng ký service worker và thử Web Push subscription nếu trình duyệt hỗ trợ Push API.
- Chat Worker thêm route Web Push: `/api/chat/notifications/status`, `/subscribe`, `/unsubscribe`, `/test`; có bảng `chat_push_subscriptions`, VAPID public/secret cho Chat Worker riêng và push ping khi sync/webhook/helper tạo tin khách mới. Desktop test profile bật được Notification, Web Push subscription endpoint đã test save/unsubscribe qua API; Chrome desktop test không tạo real Push subscription, mobile thật cần bật switch trên chính máy đó.
- Đã chặn UI gọi Order Core khi hội thoại không có mã đơn rõ ràng để tránh endpoint `/api/core/orders/by-conversation/*` bị gọi nặng với Lazada session rỗng gây 503/CORS trong Chat.
- Deploy production: Chat Worker `shophuyvan-chat-api` version `d415164a-a7ab-4d6b-ab9a-a5fa5e15ead8`; static UI `shophuyvan-analytics` version cuối `5007da05-5d13-4f35-82f5-f19b652bf45e`; Worker chính không deploy trong lượt này.
- Test pass: `npm --prefix apps/chat-worker-api test --if-present`, `node scripts/test-chat-ai-policy.mjs`, `node scripts/test-ui-design-system-guard.mjs`, `node --check` các module Chat/AI/notification đã chạm, quét mojibake scope Chat sạch.
- Production verification: Chat/CSKH `desktop 1366x900`, `tablet 820x1180`, `mobile 390x844` pass `overflowX=false`, không mojibake, có AI workspace/Gemini/keyword/memory, công tắc notification, keyword defaults đủ; final console desktop không còn `consoleErrors`/`httpErrors`.

### 2026-05-27 - Chat read-state không tái hiện chưa đọc sau đồng bộ

- Đã xử lý dứt điểm lỗi hội thoại đã mở đọc/đã trả lời nhưng Sync Shopee làm hiện lại `Chưa đọc`: Chat Core trước đây cộng `unread_count` mỗi lần merge lại message khách trùng từ lịch sử đồng bộ; nay chỉ tăng khi message khách được tạo mới thật.
- Đã xử lý lỗi danh sách nhảy/lùi nội dung: frontend `syncChannel()` giờ chờ request sync hoàn tất trước khi reload; Chat Core chỉ cập nhật `last_message_text/last_message_at` khi message cùng thời điểm hoặc mới hơn, không cho lịch sử cũ ghi đè preview hiện hành.
- Làm sạch production có kiểm soát: audit D1 tìm hội thoại `unread_count > 0` nhưng message cuối thực tế là `shop`, cập nhật `13` hội thoại về `unread_count=0`, không xóa message và không chạm hội thoại có message cuối từ khách.
- Production readback sau Sync lặp lại: `tien2612`, `tep_mega`, `lndd0701`, `quocnguyenvinhlongvo`, `a0975767745` đều `unread_count=0`; truy vấn tổng `answered_unread_after_repeated_sync=0`. Hội thoại `tien2612` giữ đúng tin cuối shop, không còn lùi về lịch sử cũ.
- Deploy production: Chat Worker `565616af-7f81-4235-a97f-b11b101c97b4`; static Chat UI `da275551-9137-4f5f-9dd3-691e58ef0df2`. Main Worker không đổi trong lượt sửa read-state này.
- Kiểm thực tế bằng Codex in-app browser: mở Chat/CSKH production, tìm `tien2612`, bấm `Sync ngay` nhiều lần rồi reload; desktop `1366x900`, tablet `820x1180`, mobile `390x844` đều hiển thị `Đã đọc`, không có badge chưa đọc, `overflowX=false`.
- Regression lock pass: `scripts/check-chat-core-local.mjs`, `scripts/test-order-chat-target.mjs`, `npm --prefix apps/chat-worker-api test --if-present`, `node scripts/test-ui-design-system-guard.mjs`.

### 2026-05-27 - TikTok Chat sender + OMS mở Chat đúng đơn production

- Đã sửa Chat Core cho TikTok no-API `0909128999`: browser-helper message được chuẩn hóa `sender_type` thành `customer` / `shop` / `system` trước khi UI đọc; production D1 đã repair đúng dữ liệu cũ gồm `5` message hệ thống và `4` message shop, không xoá message.
- Chat UI hiển thị nhãn rõ `Khách`, `Shop`, `Hệ thống`; production verified hội thoại `thietbidiencoban.123` có 2 tin `Shop / 0909128999` và 1 tin `Hệ thống / Hệ thống TikTok`; hội thoại gắn đơn `584128214410102531` giữ đúng 1 tin khách và 4 tin shop.
- TikTok không có Chat/Product Card API trong hệ thống hiện tại. Production verified nhập `k243`, chọn SKU `20BOTACKE5X30MMK243` rồi bấm `Gửi`: UI chèn thông tin Product Core vào bản nháp và báo `Đã chèn sản phẩm vào bản nháp. TikTok cần gửi tay trên sàn.`, không gửi thẻ giả cho khách.
- Đã sửa luồng OMS `Nhắn khách`: nút từ đơn `260527G4WW0496` mở đúng ngữ cảnh khách `dungnguyen_12111989 / 176971889`, không tự nhảy sang hội thoại khác khi danh sách reload; chặn response context cũ ghi đè panel hiện tại.
- Tính năng xác nhận đơn được cài theo chế độ an toàn `draft_only`: OMS lấy template từ `/api/core/orders/:orderId/chat-confirmation-template`, chuyển sang Chat và giữ nguyên bản nháp qua các lần render; không có tin nhắn production nào được tự động gửi trong lượt này.
- Production readback sau thao tác thật: panel Chat hiển thị đơn `260527G4WW0496`, sản phẩm `Đui Đèn Cảm Biến... k241`, SKU `HV999K241300S`, tổng `138.000đ`, ĐVVC `SPX Express - Trong Ngày`, tracking `VN269951043549X`; nút `Chi tiết` mở timeline gồm trạng thái hủy và chuẩn bị hàng.
- Route/file chuẩn: tính năng cài đặt xác nhận được nạp qua module nhỏ `apps/fe/js/modules/oms-chat-actions.js` + `oms-order-confirm-settings.js`, không mở rộng `apps/fe/js/oms-dashboard/oms-main.js` legacy đang vượt 30KB; toàn bộ file production sửa trực tiếp trong lượt này dưới 30KB.
- Deploy production: Worker chính `fa5432dd-dbf3-43f1-85ed-b66d5b5299e4`; Chat Worker `6674fe30-c103-491c-b25e-4db4cb4b5048`; static UI cuối `13385bb2-98cb-4d91-bbcc-80036d722130`.
- Kiểm production thật: Chat TikTok desktop `1536x900`, tablet `820x1180`, mobile `390x844` đều `overflowX=false`; OMS kiểm bằng profile `E:\codex-chrome-profiles\shophuyvan-test`. Ảnh: `tmp-verification/chat-tiktok-sender-20260527/`, `tmp-verification/order-chat-deeplink-20260527/`.
- Test pass: `node --check` các module Chat sửa; `node scripts/test-order-chat-target.mjs`; `node scripts/test-ui-design-system-guard.mjs`; `npm --prefix apps/chat-worker-api test --if-present`; `npm --prefix apps/worker-api test --if-present`.

### 2026-05-27 - Chat no-API scheduler + customer/order/product context production fix

- Đã xử lý luồng Chat/CSKH cho TikTok no-API `0909128999` và Shopee no-API `khogiadungcona`: scheduler có `auto_chat_enabled`, chạy `sync_chat` theo lịch, gọi local helper `/chat-sync` vào Chat Worker `https://shophuyvan-chat-api.zacha030596.workers.dev`, không gọi Seller Center fallback cho shop API.
- Local automation đã sửa đúng profile/headful: TikTok dùng `E:\shophuyvan-python-automation\profiles\browser\shophuyvan-runner-tiktok`, Shopee no-API dùng `E:\shophuyvan-python-automation\profiles\browser\HuyVan_Bot_Data_khogiadungcona`; CDP port cố định theo profile, không kill Chrome chung, chỉ đóng PID thuộc profile automation nếu cần khởi động lại CDP.
- Chat Core đã bù `customer_name` từ message customer đã lưu cho dữ liệu cũ, đồng thời tìm kiếm server-side theo nội dung message, `order_id` và attachment order-card. Production readback `q=584128214410102531` trả conversation `conv_tiktok_0909128999_automation_tiktok_d04324097f8052cb` với `customer_name=nguyn.xun.ha.63574`.
- Chat UI search không còn chỉ lọc 200 row local; nhập mã đơn sẽ gọi lại Chat Core. Tab `Đơn` đọc `/api/core/orders/by-conversation/*` và `/api/logistics-watch/detail`; tab `Sản phẩm` chỉ render Product/Order Core, không tự tính nghiệp vụ ở frontend.
- Production UI verified bằng Codex Browser trên `https://shophuyvan-analytics.nghiemchihuy.workers.dev/pages/chat-cskh.html`: tìm `584128214410102531`, tên khách không còn `Khách chưa rõ`, có đơn `Đã giao · 33.000đ`, sản phẩm `Kẹp Cố Định...`, SKU `10 KẸP SIZE 16MM TRẮNG K114`, tồn `48`, ĐVVC `BEST Express`, mã vận đơn `TTVN1088367610`.
- Automation readback thật: `/auto-scheduler/status` heartbeat `2026-05-27T10:27:57+07:00`, `auto_order/status/detail/finance/label/chat` đều bật, `chat_min/max=10/20`; last chat run `status=ok`, TikTok `accepted_messages=20`, Shopee `status=no_messages`, không có errors.
- Deploy production: Chat Worker `shophuyvan-chat-api` version `3e97ebc5-82e2-461b-afc7-ef15908c047f`; static UI `shophuyvan-analytics` version `0cbec3a7-f90e-4891-8dce-242288ff74bc`; Worker chính giữ version đã deploy trong lượt automation `a65c18f8-a191-45bb-b8ae-fac1824f0877`.
- Responsive verification bằng Codex Browser: desktop `1366x900`, tablet `820x1180`, mobile `390x844` đều `overflowX=false`, có customer/order/product/tracking; ảnh lưu `tmp-verification/chat-automation-20260527/{desktop,tablet,mobile}.png`.
- Test pass: `npm --prefix apps/chat-worker-api test`, `npm --prefix apps/worker-api test`, `node scripts/check-chat-core-local.mjs`, `node scripts/test-oms-auto-scheduler.mjs`, `node scripts/test-ui-design-system-guard.mjs`, `node scripts/check-oms-core-regression-lock.mjs`, `python -m py_compile` các file local helper/chat browser/Radar.
- Lưu ý deploy static: do worktree đã bẩn sẵn, Wrangler upload thêm các asset ngoài phạm vi Chat (`customer-database`, `oms-dashboard`, `oms-bot-settings`) vốn đã thay đổi trước đó; không revert vì không xác định owner/caller trong lượt này.

### 2026-05-27 - TikTok Finance Lock: ADS ngoài ví/PiShip từ Cost Setting

- Đã sửa Finance Core theo đúng yêu cầu ảnh OMS: TikTok Seller Center vẫn là nguồn chuẩn cho doanh thu/phí sàn/thuế/SFR/settlement, còn `ADS ngoài ví` và `PiShip` trong tab `Lợi nhuận` lấy từ Cost Setting khi Seller Center không trả dòng ngoài ví.
- Luật khóa mới: `ADS ngoài ví` và `PiShip` Cost Setting chỉ trừ lợi nhuận (`profit_real_display`, `profit_invoice_display`), không cộng vào `platform_deduction_total`, `total_deductions`, `marketplace_fee_total`, `tax_total` hoặc nhãn `Tổng khấu trừ`.
- File chuẩn đã sửa: `apps/worker-api/src/core/orders/finance-taxonomy-core.js`, `apps/worker-api/src/core/orders/fee-phase1-core.js`, `apps/worker-api/src/core/orders/fee-phase1-support-core.js`; UI `apps/fe/js/modules/oms-fee-render.js` vẫn chỉ render read-model, không tự tính nghiệp vụ.
- Regression lock đã cập nhật: `scripts/test-finance-taxonomy.mjs`, `scripts/test-tiktok-seller-center-finance.mjs`, `scripts/check-oms-core-regression-lock.mjs`; skill `shophuyvan-finance-core-guard` trong repo và local đã có mục `TikTok Finance Lock` để tránh đổi ngược.
- Test pass: `node --check` các file Core/test đã chạm; `node scripts/test-finance-taxonomy.mjs`; `node scripts/test-tiktok-seller-center-finance.mjs`; `node scripts/check-oms-core-regression-lock.mjs`; `npm --prefix apps/worker-api test --if-present`; `npm --prefix apps/worker-api run lint --if-present`; `npm --prefix apps/worker-api run build --if-present`; `node scripts/test-ui-design-system-guard.mjs`.
- Deploy production: Worker chính `huyvan-worker-api` version `25ae3ebb-f598-4637-8b22-d692aa6b5b39`, Cloudflare account `efe50fab1dd644088d681fb14a4838ae`. Static UI không deploy vì UI chỉ render read-model và không đổi trong lượt này.
- Production readback đúng đơn ảnh `584211305752462759`: `/api/orders?search=584211305752462759&limit=5&fresh=1` trả `estimated_income=37975`, `actual_income=null`, `ads_fee_total=5500`, `piship_fee=2008`, `fee_breakdown.totals.internal=7508`, `fee_breakdown.totals.total_deductions=0`, `profit_real=11467`.
- Production UI verification bằng OMS `https://shophuyvan-analytics.nghiemchihuy.workers.dev/pages/oms-dashboard`: popup tab `Lợi nhuận` hiển thị `ADS ngoài ví -5.500đ`, `PiShip -2.008đ`, `Lãi tạm tính 11.467đ`; desktop `1366x900`, tablet `820x1180`, mobile `390x844` đều pass, không tràn ngang. Ảnh lưu ở `tmp-verification/tiktok-finance-cost-setting-desktop.png`, `tmp-verification/tiktok-finance-cost-setting-tablet.png`, `tmp-verification/tiktok-finance-cost-setting-mobile.png`.

### 2026-05-27 - Chat/CSKH order detail payment evidence + tracking timeline

- Đã sửa đúng luồng Core-first cho lỗi Chat/CSKH: Order Core giờ trả `payment_method`, `payment_time`, `payment_time_source`, `customer_note`, `customer_note_source`, `shipping_carrier/logistics_provider` qua `/api/core/orders/by-conversation/*`; Chat UI chỉ render read-model và merge thêm bằng chứng từ `/api/logistics-watch/detail`, không tự suy luận nghiệp vụ.
- Backend bổ sung `orders_v2.payment_time/payment_time_source`; Shopee API sync lưu `pay_time` từ `/api/v2/order/get_order_detail`, Lazada sync lưu các field payment time nếu `/orders/get` trả về; import/status sync giữ payment evidence bằng update riêng sau batch để không phá luồng tài chính.
- Nút `Chi tiết` trong tab `Đơn` của Chat/CSKH không còn chèn tóm tắt vào ô chat; bấm sẽ mở modal timeline vận chuyển thật từ Tracking Core `/api/logistics-watch/detail?order_id=...`, kèm ĐVVC, mã vận đơn, phương thức/thời gian thanh toán.
- Ghi chú người mua trong Chat panel ưu tiên `customer_note` từ Open Platform/Core; nếu Core thật sự rỗng thì hiển thị `Không có`, không fake nội dung.
- Test pass: `node --check` các file Worker/UI đã chạm, `node scripts/test-order-detail-evidence-core.mjs`, `node scripts/test-ui-design-system-guard.mjs`.
- Deploy production: Worker chính `huyvan-worker-api` version `9885bf85-0104-4ee3-a22e-57dd05fb88bd`; static `shophuyvan-analytics` version `847f09bd-2b41-4ed4-81d0-c1643657e1ba`.
- Production readback đúng đơn user chỉ `260525BY4BCTM7`: `/api/logistics-watch/detail` trả `payment_method=Cash on Delivery`, `logistics_provider=Giao Hàng Nhanh`, `tracking_number=GYTHYDFX`, `tracking_events=3`; `/api/core/orders/by-conversation` trả đúng order/card/item. Shopee không trả `pay_time` cho đơn COD này nên Core giữ `payment_time` rỗng và UI hiển thị `Chưa có`, không tự bịa thời gian.
- Production UI verification Chrome profile `E:\codex-chrome-profiles\shophuyvan-test`: Chat/CSKH chọn `yytk_4vmzo | phambich2312`, desktop `1366x900`, tablet `820x1180`, mobile `390x844` đều hiện phương thức thanh toán, ĐVVC, mã vận đơn, ghi chú người mua `Không có`; bấm `Chi tiết` mở modal timeline 3 mốc vận chuyển, overflow ngang `0`.
- Còn mở kỹ thuật: `apps/worker-api/src/core/orders/read-core.js` và `apps/worker-api/src/core/shared-data/core-data-core.js` đã vượt 30KB từ trước; hotfix này chưa tách refactor vì đang xử lý lỗi production trực tiếp.

### 2026-05-27 - Lazada Chat IM paging/backfill đúng mốc hiện tại

- Đã sửa root cause Lazada Chat sync thiếu tin gần đây: bridge trước đó truyền `start_time` như mốc “từ ngày đó”, trong khi Lazada IM dùng như mốc kéo lùi. Khi đặt mốc quá cũ (`60/90/365` ngày), `/im/message/list` trả HTTP 200 nhưng bỏ tin mới/gần đây. Bridge mới dùng mốc hiện tại, kéo lùi theo trang, nên không còn bỏ tin 22/05-26/05.
- Đã tách phân trang Lazada sang `apps/worker-api/src/routes/marketplace-chat/lazada-bridge-paging.js` để `lazada-bridge.js` vẫn dưới 30KB. Sync hỗ trợ target conversation đang mở, nhiều trang message cho target, session pagination, và retry nhẹ khi Lazada trả `ApiCallLimit`.
- Đã cập nhật Chat Worker adapter Lazada để forward `force_history`, `page_count/session_page_count`, `message_page_count`, `target_conversation_id`, `platform_conversation_id`, `days/start_time` xuống Worker bridge; UI/Chat Core vẫn chỉ render read-model từ Chat Core.
- Production deploy: Worker chính `6c2ddd52-bf39-4080-bebe-4e598bff4c7d`; Chat Worker `814232b6-5150-405f-a94a-86e235a2ab11`.
- Production readback Lazada `shop_id=200166591213`: sync target `S***y / 200006334685_1_200166591213_2_103` kéo `9` tin, `8` duplicate và `1` tin mới; thread có đủ các tin 31/03, 2 ảnh/tệp đính kèm, không raw JSON. Sync shop `limit=20` kéo `20` hội thoại, `98` tin, lưu `54` tin mới ở lượt đầu sau retry, không còn `ApiCallLimit` ở attempts cuối.
- Production conversation list readback hiện có Lazada gần đây: `2026-05-26`, `2026-05-25`, `2026-05-24`, `2026-05-22`, `2026-05-21`, `2026-05-20`; `sync_health=ok`.
- Production UI verification Chrome/CDP: desktop `1366x900`, tablet `820x1180`, mobile `390x844` có Lazada `S***y`, có các row Lazada mới, không tràn ngang, có composer, không thấy raw `{"txt":...}` / `actionCode` / `[object Object]`.
- Còn mở: Lazada Open Platform chỉ trả tên khách dạng mask cho nhiều hội thoại (`S***y`, `T********r`, số mask); không tự bịa tên thật nếu API không trả plaintext. Một số row legacy `conv_*` không có `platform_conversation_id` cần cleanup dữ liệu bẩn ở lượt riêng, không xoá trong hotfix sync này.

### 2026-05-27 - OMS API order detail evidence: timeline, thanh toán, ghi chú khách

- Đang nối theo Core-first cho OMS Logistics: Shopee/Lazada API sync ghi phương thức thanh toán và ghi chú khách vào `orders_v2`, timeline vận chuyển vào `order_tracking_core`; UI drawer chỉ đọc `/api/logistics-watch/detail`, không tự suy luận nghiệp vụ ở frontend.
- Endpoint đã kiểm từ Open Platform/reference: Shopee `/api/v2/order/get_order_detail`, `/api/v2/logistics/get_tracking_info`, `/api/v2/logistics/get_tracking_number`, `/api/v2/payment/get_payment_method_list`, `/api/v2/payment/get_escrow_detail`; Lazada `/orders/get`, `/order/items/get`, `/logistic/order/trace`, `/finance/transaction/details/get`.
- Đã cập nhật skill/reference: `shophuyvan-ui-ux-master-skill` có bản chuẩn trong repo và local skill store; `shopee-open-platform-docs/references/order-logistics-payment-endpoints.md` ghi mapping endpoint -> Core fields cho đơn/timeline/thanh toán/ghi chú.
- Shop có API: Shopee `chihuy1984`, `chihuy2309`, `phambich2312` dùng Open Platform trước; Lazada `kinhdoanhonlinegiasoc@gmail.com` dùng Open Platform trước. Shop không API không được gắn nhãn đồng bộ API và không dùng Seller Center fallback khi chưa ghi rõ `api_permission_missing`/`token_scope_missing`.
- File chuẩn đang sửa: `apps/worker-api/src/routes/api-sync/shopee/orders/sync.js`, `apps/worker-api/src/routes/api-sync/lazada/orders/sync.js`, `apps/worker-api/src/routes/api-sync/common/shop-auth.js`, `apps/worker-api/src/routes/logistics/index.js`, `apps/worker-api/src/core/orders/transport-core.js`, `apps/worker-api/src/routes/orders/import-orders-v2.js`, `apps/worker-api/src/routes/operations/carrier-analytics.js`, `apps/fe/js/modules/oms-logistics-watch.js`.
- Test/deploy/production verification: pass `node --check` file chạm, `node scripts/test-order-detail-evidence-core.mjs`, `node scripts/test-ui-design-system-guard.mjs`, `node scripts/check-oms-core-regression-lock.mjs`, `npm --prefix apps/worker-api test --if-present`, FE build/lint scripts. Deploy Worker chính `443ee7b7-cc4b-450b-abec-7af12bdc973c`, static UI `392fb66d-7022-489d-995a-b3517b3bf62d`.
- Production readback: Shopee `260526E7Q5NGSJ/chihuy1984` status sync `checked=1`, `tracking_timeline_updated=1`, detail source `Shopee Open Platform`, tracking `GYTXXH7K`, ĐVVC `Giao Hàng Nhanh`, payment `Cash on Delivery`; Lazada `528922543424254` source `Lazada Open Platform`, tracking `JNTMP0040789628VNA`, payment `MIXEDCARD`, trace `6` events.
- Production UI verification: mở OMS production bằng profile `E:\codex-chrome-profiles\shophuyvan-test`, drawer đơn `260526E7Q5NGSJ` pass desktop `1366x900`, tablet `820x1180`, mobile `390x844`; có `Thanh toán`, `Ghi chú khách`, timeline/tracking, không tràn ngang, không lộ raw endpoint.

### 2026-05-27 - Chat Core Lazada IM tên khách/nội dung/sản phẩm/đơn

- Đã kiểm Lazada Open Platform chính thức: IM có `/im/session/list`, `/im/session/get`, `/im/message/list`, `/im/message/send`; `SendMessage` hỗ trợ `template_id=1` text, `3` picture, `10006` item, `10007` order, `10008` voucher. Order/Product có endpoint chính thức `GetOrder/GetOrderItems` và `/products/get`.
- Đã sửa Core-first cho Lazada, không vá UI: Worker bridge parse nhiều lớp JSON trong Lazada `content`, ưu tiên `txt.vi/en`, bóc `itemId/orderId/imgUrl`, gọi thêm `/im/session/get` để lấy tên khách khi list thiếu, và backfill item message vào Product Knowledge Core để Chat UI đọc lại qua `/api/core/products/search`.
- Đã nối gửi thẻ Lazada: Chat Worker adapter hỗ trợ `send_product_card` -> `/im/message/send template_id=10006` và `send_order_card` -> `/im/message/send template_id=10007`; FE nút `Gửi` trong panel Sản phẩm/Đơn gọi route Chat Core thay vì chỉ chèn text.
- Production deploy: Worker chính `70330a62-5b90-495a-b61d-643ca28853c2`; Chat Worker `6705efbb-9021-4dc7-a65f-1cd76fda59cb`; FE static `d29155bb-59b7-4d00-bc39-cee47dfa6fe4`.
- Production readback Lazada `shop_id=200166591213`: force sync `pulled_conversations=20`, `pulled_messages=65`; target `200006334685` hiện `customer_name=S***y`, không còn raw JSON, tin ảnh có attachment URL, item `3071608306` vào Product Knowledge Core với tên/ảnh/SKU/giá `219.000đ`.
- Production UI verification: mở Chat/CSKH production, tìm `S***y`, header hiện tên khách, message không còn `{"txt":...}`/`actionCode`, có 2 ảnh thật; tab Sản phẩm hiện card `Gioăng Bồn Cầu...`, ảnh Lazada, SKU `14763096976`, giá `219.000đ`, nút `Gửi`; desktop/tablet/mobile không tràn ngang và có nút thoát.
- Test pass: `node --check` các file Lazada bridge/adapter/order-product card/FE chat, `node scripts/check-oms-core-regression-lock.mjs`, `node scripts/test-ui-design-system-guard.mjs`.
- Còn mở: một số hội thoại Lazada rất cũ nếu `/im/session/get` không trả tên thì chỉ có thể hiển thị tên mask/ID do Lazada cung cấp; không tự bịa tên khách ngoài dữ liệu Open Platform.

### 2026-05-26 - Chat Core Duoke-style order/product/read UI follow-up

- Đã làm theo hướng Core-first, không làm từng shop riêng: Chat UI chỉ đọc Chat Core, Order Core `/api/core/orders/by-conversation` và Product Core `/api/core/products/search`; phần Shopee read-state đi qua Chat Worker -> Worker bridge -> SellerChat.
- Đã sửa UI vận hành: bỏ tab `Khách` và tab chi tiết `Gợi ý AI`, panel chi tiết có nút đóng/back trên mobile, `Gợi ý AI` chèn trực tiếp vào ô chat, Đơn/Sản phẩm hiển thị dạng vận hành có ảnh, mã đơn/SKU/giá/tồn, không còn `[object Object]`.
- Đã thêm phân biệt đã đọc/chưa đọc: conversation unread có nền/viền nhấn mạnh và badge `Chưa đọc N`; row đã mở chuyển `unread_count=0` trong Chat Core và hiển thị `Đã đọc`.
- Đã nối route đọc: `POST /api/chat/conversations/:id/read` cập nhật Chat Core, adapter Shopee gọi Worker bridge `/api/internal/chat-bridge/shopee/conversations/read`, bridge gọi `/api/v2/sellerchat/read_conversation` với `conversation_id` và `last_read_message_id`.
- Endpoint đã kiểm/dùng: Shopee `read_conversation` có trong Open Platform/reference và wrapper `shopee-open-api`; runtime production hiện vẫn trả `param_error` từ Shopee cho platform read, nên chỉ xác nhận Chat Core local read pass, chưa ghi platform read pass.
- Deploy production: Worker chính `8c12d518-333c-472a-b1f7-42155e72a73e`; Chat Worker `65f00fed-af16-47fe-b493-817d2132a6f7`; static UI `e970471c-91a8-41d7-a873-7b1c3bf73d3b`.
- Production verification Chrome/CDP: desktop `1440x900`, tablet `820x1180`, mobile `390x844` pass; AI input length `107`, order card `1` + order image `1`, product card `1` + product image `1`, mobile close button pass, no horizontal overflow, no `[object Object]`.
- Còn mở: Shopee platform `read_conversation` cần tiếp tục đối chiếu schema thật vì production vẫn `param_error`; UI/Chat Core không gọi pass giả.

### 2026-05-26 - Chat Core Shopee order/image/composer production fix

- Đã tra trực tiếp Shopee Open Platform website/API doc endpoint: FAQ Customer Service App Type xác nhận nhóm SellerChat có `get_conversation_list`, `get_message`, `get_one_conversation`, `send_message`, `read_conversation`, `upload_image`, `webchat_push`; push doc `webchat_push` xác nhận message có loại `image`, `item` và metadata order/item. FAQ cũng liệt kê nhóm Product `get_item_list`, `get_item_base_info`, `get_item_extra_info`, `get_model_list` và Order `get_order_list`, `get_order_detail`.
- Đã sửa Core/read-model, không vá riêng từng shop: `shopee-chat-normalize.js` parse `order_id/order_sn/product_ids` từ message content; frontend Chat lấy `order_ids` đang có trong message để gọi `/api/core/orders/by-conversation`, lấy product id qua `/api/core/products/search`, rồi chỉ render card từ read-model Core.
- Đã sửa UI Chat: `render.js` hiển thị card đơn ngay trong bong bóng chat, render ảnh/video/file thật từ attachment thay vì text URL, và `context.js/index.js/message-context.js` đảm bảo mở hội thoại đầu tiên cũng load context. `chat.css` đổi thread panel sang flex column để hội thoại dài vẫn thấy ô nhập.
- Production readback sau sync Shopee `170044686/chihuy1984`: `POST /api/chat/sync` trả `pulled_conversations=45`, `pulled_messages=138`; message `[Đơn hàng] 260526EBHR5T4A` đã lưu `order_id=260526EBHR5T4A`, attachment ảnh vẫn có URL thật.
- Production Core readback: `/api/core/orders/by-conversation` trả đơn `260526EBHR5T4A`, trạng thái `Đã giao`, doanh thu `47.500đ`, tracking `VN2696441018001`, item image/name. Product message riêng chưa có trong thread `kalot4991`, nhưng endpoint Product Core `/api/core/products/search` đã được nối cho message dạng item/product.
- Deploy production: Worker chính `huyvan-worker-api` version `624584d2-ae6e-470b-9cc7-b781b94f98f7`; static `shophuyvan-analytics` version cuối `85104fd5-2abf-45d2-9c74-b76ef6a33cd2`; Chat Worker giữ version hiện có.
- Production UI verification bằng Chrome/CDP trên `chat-cskh.html?verify=chat-responsive-*`: mobile `390x844`, tablet `820x1180`, desktop `1366x900` đều pass. Thread `kalot4991` hiện card `260526EBHR5T4A / Đã giao · 47.500đ`, ảnh sticker Shopee render thành `<img>`, ô chat nằm trong viewport, không tràn ngang, không HTTP/console error.
- Test pass: `node --check` các file Chat đã sửa, `npm --prefix apps/chat-worker-api test --if-present`, `npm --prefix apps/worker-api test --if-present`, `node scripts/test-ui-design-system-guard.mjs`, `node scripts/check-oms-core-regression-lock.mjs`, `node scripts/check-chat-core-browser.mjs`.
- Còn mở: đơn `250404CP6PP12C` trong hội thoại cũ chưa tìm thấy trong Order Core nên UI hiển thị `Chưa tìm thấy đơn`; không bịa dữ liệu đơn nếu Core không có readback.

### 2026-05-26 - Chat Core Shopee current-list API fix verified

- Đã tra trực tiếp Shopee Open Platform website/API doc endpoint: public FAQ Customer Service App Type xác nhận nhóm endpoint SellerChat gồm `get_conversation_list`, `get_message`, `get_one_conversation`, `send_message`, `read_conversation`, `upload_image`, `webchat_push` và các endpoint liên quan. Trang chi tiết `/doc/api` cho SellerChat đang bị khóa đăng nhập/quyền với `error_auth`, không kết luận thiếu endpoint.
- Root cause production: bridge dùng sai tham số `direction=latest&type=all`, Shopee trả danh sách cũ năm 2024. Probe đọc-only trên production token shop `170044686` chứng minh `direction=older&type=all` mới khớp Seller Center hiện tại và thấy `kalot4991`, `tdminh82`, `phamdathao273`, `anhvunhi1995`, `tiendatfarm`, `quochuy190195`, `tien193200`, `shop24_7`, `thuthai984`, `ri.decor`.
- Đã sửa Core/API, không vá UI: `apps/worker-api/src/routes/marketplace-chat/shopee-bridge.js` dùng `fetchShopeeConversationListPages()` với `direction=older&type=all`; thêm `apps/worker-api/src/routes/marketplace-chat/shopee-bridge-list-probe.js` để diagnostic đọc-only; `apps/chat-worker-api/src/adapters/shopee.js` forward probe an toàn; `apps/chat-worker-api/src/core/sync-core.js` không ghi đè metric từng hội thoại bằng metric tổng shop và fallback `sender_name` khách từ conversation Core; `apps/chat-worker-api/src/core/browser-helper-core.js` lưu `customer_name` cho luồng browser-helper/no-API.
- Deploy production: Worker chính `huyvan-worker-api` version `77fa391a-2613-4130-b918-730382eb4fc7`; Chat Worker `shophuyvan-chat-api` version `0caf8953-945d-4f56-bc23-7e55fb64d8b8`; static UI dùng bản đã deploy trước đó.
- Production readback API sau sync `170044686/chihuy1984`: `pulled_conversations=45`, `pulled_messages=138`, `sync_health=ok`; Chat Core tìm được khách mới với tên thật và shop thật: `kalot4991`, `tdminh82`, `phamdathao273`, `anhvunhi1995`, `tiendatfarm`, `quochuy190195`, `tien193200`, `shop24_7`, `thuthai984`, `ri.decor`.
- Production message readback: `kalot4991` có 11 tin, gồm tin ngày `2026-05-26`; `phamdathao273` có 9 tin; `anhvunhi1995` có 8 tin; `tiendatfarm` có 3 tin; `ri.decor` có 18 tin. Tin customer đã có `sender_name=kalot4991` thay vì rỗng.
- Production UI Chrome/CDP `chat-cskh.html?verify=shopee-current-chat-20260526`: mobile `390x844`, tablet `820x1180`, desktop `1366x900` pass, không console error, không HTTP error, không tràn ngang. UI hiển thị `kalot4991 | GIA DỤNG HUY VÂN`, `tdminh82`, `phamdathao273`, `anhvunhi1995`, thread `kalot4991` có tin ngày `26/5/2026` và panel khách hiển thị `Khách kalot4991`, `Mã khách 83299914`.
- Test pass: `node --check` các file Chat bridge/adapter/sync/browser-helper, `node scripts/test-ui-design-system-guard.mjs`, `node scripts/check-oms-core-regression-lock.mjs`. Cấm kỵ mới: không dùng `direction=latest` cho SellerChat list hiện tại của Shopee; nếu đổi phải probe production read-only và so với Seller Center trước.

### 2026-05-26 - Chat Core Shopee lost-push + paging readback sau phản hồi

- Đã sửa production `/api/webhooks/events` bị lỗi `ensureColumn is not defined` bằng cách phục hồi helper trong `apps/worker-api/src/core/marketplace/push-subscriptions-core.js`.
- Đã thêm `apps/worker-api/src/routes/marketplace-chat/shopee-lost-push.js` và nối vào Shopee bridge: `force_history/diagnostic` gọi read-only `/api/v2/push/get_lost_push_message`, không gọi confirm/consume, không ghi Seller Center fallback.
- Đã thêm paging/dedupe cho `/api/v2/sellerchat/get_message`: target tối đa 5 trang, conversation khác tối đa 2 trang; nếu Shopee trả lại trang trùng thì dừng để không bơm sai số.
- Deploy production: Worker chính `a01e7e9a-4bc2-4977-8bd8-e1dd1cf3c137`; Chat Worker `c95493cf-8836-42bf-81ac-8ab9b135a335`; static UI không đổi.
- Production readback target `170044686 / 296431470344582725 / 69018330`: `customer_name=tdminh82`, `shop_display_name=GIA DỤNG HUY VÂN`, `sync_health=ok`, target `get_message` chỉ có 8 tin unique.
- Message dates vẫn chỉ `2026-05-16`, `2026-05-18`, `2026-05-26`; không có `2026-05-22..2026-05-25` trong `get_message`, trong lost-push, hoặc webhook recent. `webchat_push` có subscription và đã từng nhận 141 event, nhưng lần gần nhất là `2026-05-06 14:05:21`.
- Production UI Chrome/CDP: desktop/tablet/mobile không tràn ngang, không HTTP 501/503. Screenshot đúng target: `tmp-verification/chat-shopee-tdminh82-final-selected-desktop.png`, `chat-shopee-tdminh82-final-mobile.png`, `chat-shopee-tdminh82-final-tablet.png`.
- Còn mở: nếu Seller Center thật sự hiển thị tin 22/05-25/05 trong cùng conversation thì Open Platform hiện chưa trả qua `get_message`/lost-push/webhook log; bước tiếp theo phải mở Seller Center/Duoke hoặc profile Shopee thật để đối chiếu raw DOM/official conversation id, không được kết luận đã đồng bộ đủ.

### 2026-05-26 - Chat Core Shopee tên khách thật + SellerChat readback 22-26/05

- Đã sửa Worker bridge Shopee `apps/worker-api/src/routes/marketplace-chat/shopee-bridge.js` và module normalize mới `apps/worker-api/src/routes/marketplace-chat/shopee-chat-normalize.js`: gọi thêm `/api/v2/sellerchat/get_one_conversation` khi sync target, lấy tên khách từ `to_name/buyer_name/from_user_name/...`, parse `latest_message_content`, chuẩn hóa media text như `Đã gửi hình ảnh`, và giới hạn batch để không vượt subrequest Cloudflare.
- Đã sửa Chat Worker `apps/chat-worker-api/src/adapters/shopee.js` + `apps/chat-worker-api/src/core/sync-core.js`: cho phép sync production chạy `diagnostic=true` có kiểm soát, chỉ trả key/field mẫu đã lọc, không trả token/cookie.
- Endpoint đã dùng/kiểm: Shopee SellerChat `/api/v2/sellerchat/get_conversation_list`, `/api/v2/sellerchat/get_one_conversation`, `/api/v2/sellerchat/get_message`. Không dùng Seller Center fallback cho shop API.
- Production deploy: Worker chính `huyvan-worker-api` version `9f3997fc-48a0-4d96-b98e-df0dcfee59a0`; Chat Worker `shophuyvan-chat-api` version `95ce6a84-dca8-4a61-8fc9-219dddc085e3`; static UI không đổi.
- Production readback đúng conversation user báo `shop_id=170044686`, `platform_conversation_id=296431470344582725`, `customer_id=69018330`: Open Platform/SellerChat trả `to_name/buyer_name=tdminh82`; Chat Core đã lưu `customer_name=tdminh82`, `shop_display_name=GIA DỤNG HUY VÂN`, `last_message_text=DẠ`, `sync_health=ok`, không còn `HTTP 501/503`.
- Production message readback đúng conversation này hiện có 8 tin, ngày `2026-05-16`, `2026-05-18`, `2026-05-26`. Dải `2026-05-22` đến `2026-05-25` không có message trong response `/api/v2/sellerchat/get_message` của conversation `296431470344582725`; đây là phần còn mở cần đối chiếu tiếp bằng webhook/lost-push/cursor nếu Shopee Seller Center hiển thị tin trong cùng conversation.
- Production UI Chrome/CDP port `9333`: mở `chat-cskh.html`, tìm `69018330`, UI hiện `tdminh82`, `Shopee · GIA DỤNG HUY VÂN`, detail `Khách tdminh82`, `Mã hội thoại 296431470344582725`; bấm topbar `Sync ngay` thật trả toast `Đã quét 4 shop, 181 hội thoại, đọc 398 tin, lưu 0 tin mới`, không console/http error. Responsive desktop `1366x900`, tablet `820x1180`, mobile `390x844` không tràn ngang. Screenshots: `tmp-verification/chat-shopee-tdminh82-after-sync-desktop.png`, `chat-shopee-tdminh82-tablet.png`, `chat-shopee-tdminh82-mobile.png`.
- Test pass: `npm --prefix apps/chat-worker-api test`, `npm --prefix apps/worker-api test --if-present`, `node --check` các file Shopee bridge/normalize/adapter/sync-core, file sửa đều dưới 30KB.

### 2026-05-26 - Chat Core Shopee sync target + multi-shop production fix

- Root cause mới từ phản hồi production: bridge Shopee chỉ lấy `get_conversation_list` rồi kéo message cho batch đó; khi người dùng đang mở một hội thoại không nằm trong batch, UI vẫn báo sync nhưng hội thoại đang mở không được kéo lại. Nút `Sync ngay` ở topbar cũng chỉ sync active conversation, trái với rule đã chốt là Shopee API phải quét các shop API.
- Đã sửa Worker bridge `apps/worker-api/src/routes/marketplace-chat/shopee-bridge.js`: nếu frontend truyền `platform_conversation_id` Shopee thật thì bridge bắt buộc thêm hội thoại đó vào batch và gọi `/api/v2/sellerchat/get_message`; không dùng local `conversation.id` dạng `conv_*` làm `platform_conversation_id`.
- Đã sửa frontend `apps/fe/js/dashboard/chat/data.js` và `events.js`: nút topbar `Sync ngay` quét từng shop API của kênh đang mở; nút trong chẩn đoán hội thoại vẫn sync riêng active thread. Toast mới ghi rõ số shop, số hội thoại quét, số tin đọc, số tin mới lưu.
- Dữ liệu bẩn phát sinh trong lần kiểm đã dọn: xoá 2 conversation rỗng `platform_conversation_id LIKE 'conv_%'` do bản vá trung gian tạo ra; readback sau cleanup không còn row Shopee `conv_*`.
- Deploy production: Worker chính `huyvan-worker-api` version `00f9cb9d-3275-4590-b13b-32395ab2a63a`; Chat Worker `shophuyvan-chat-api` version `397b332d-83c8-492f-8aed-d12ffc10ab06`; static UI `shophuyvan-analytics` version `63bb113c-aa79-4508-8c4d-94aa439f243f`.
- Production API readback đúng hội thoại `69018330 / 296431470344582725`: sync trả `200`, `pulled_conversations=51`, target result `pulled_messages=8`, `saved_messages=4`, `last_error_code=""`, `sync_health=ok`. Message dates hiện có từ SellerChat/Core: `2026-05-16`, `2026-05-18`, `2026-05-26`; không thấy `2026-05-22` đến `2026-05-25` trong response `get_message` của đúng conversation này.
- Production UI thật bằng Chrome/CDP port `9333`: mở `chat-cskh.html`, bấm `Sync ngay`; danh sách Shopee nhảy lên các shop API vừa sync, không còn `HTTP 501`/`HTTP 503`, desktop/tablet/mobile không tràn ngang. Screenshots lưu tại `tmp-verification/chat-sync-desktop-20260526c.png`, `chat-sync-tablet-20260526c.png`, `chat-sync-mobile-20260526c.png`.
- Còn mở: một số conversation Shopee mới từ `get_conversation_list` có `last_message_text=""` hoặc `get_message` trả 0 message dù timestamp mới; cần tiếp tục đối chiếu schema/cursor của SellerChat hoặc webhook `webchat_push` nếu muốn phủ đủ mọi tin gần đây mà API list/message không trả nội dung.

### 2026-05-26 - Chat Core Shopee sync/realtime UI hotfix

- Follow-up sau phản hồi production: phát hiện lần trước chỉ kiểm request sync trả `200`, nhưng chưa kiểm `last_error_code` của đúng active conversation `172077`. Root cause: sync shop thành công nhưng lỗi cũ `shopee_bridge_sync_error / Shopee bridge sync HTTP 503` trên conversation cùng shop không được clear nếu conversation đó không nằm trong batch latest 50.
- Đã sửa `apps/chat-worker-api/src/core/sync-core.js`: sau khi shop-level polling sync thành công, Chat Core cập nhật lại sync state sạch cho toàn bộ conversation cùng `channel + shop_id`, để UI không giữ badge lỗi cũ. Đây là sửa Core/read-model, không ẩn lỗi ở frontend.
- Deploy follow-up: Chat Worker `shophuyvan-chat-api` version `1ef3e6a2-b94e-4cc3-b583-8f21659e7e14`; static UI không đổi trong follow-up này.
- Production readback đúng row lỗi: trước sync conversation `172077` có `last_error_code=shopee_bridge_sync_error`, `last_error_message=Shopee bridge sync HTTP 503`, `sync_health=critical`; sau sync shop `170044686` trả `200`, row `172077` thành `last_error_code=""`, `last_error_message=""`, `sync_health=ok`, `last_success_at=2026-05-26T10:25:58.925Z`.
- Production UI readback bằng Chrome profile `E:\codex-chrome-profiles\shophuyvan-test`: mở Chat/CSKH đúng conversation `69018330 / 296431470344582725`, header không còn `Shopee bridge sync HTTP 503`, hiển thị `Đồng bộ ổn`, không console/http error, không tràn ngang desktop.

- Đã đọc đủ guard/docs bắt buộc trước khi sửa: `AGENTS.md`, Core/Warehouse/ADS/Automation/Label/Finance/Order/Product/UI guard, `PROJECT-CURRENT-STATE`, `warehouse-core-map`, `core-data-map`, `marketplace-endpoint-master-checklist`, `marketplace-endpoint-progress`, `python-automation`, `ui-design-system`, `ui-production-checklist`, `shophuyvan-ui-master-prompt`, design tokens và `scripts/test-ui-design-system-guard.mjs`. Skill `shophuyvan-ui-ux-master-skill` không tồn tại trong local skill, dùng fallback từ `docs/shophuyvan-ui-master-prompt .md`.
- Chat Core lưu thêm read-model `customer_name`, `shop_display_name`, `shop_name_source`, `shop_profile_source`, `shop_name_missing`; UI Chat chỉ render tên từ read-model, không tự suy luận nghiệp vụ. Shop Shopee API production hiện hiển thị tên shop như `GIA DỤNG HUY VÂN`, `shophuyvan.vn`, `phambich2312`; nếu SellerChat không trả tên khách thì UI vẫn hiển thị `customer_id` thật, không bịa tên.
- Route `POST /api/chat/sync` không còn trả `HTTP 501` cho trạng thái vận hành hợp lệ. Shopee no-API `khogiadungcona` trả `200` với `manual_required/shop_api_not_configured`; shop này vẫn đi import/helper tay, không gọi SellerChat API.
- Nút sync thủ công gửi `force_history=true`, `page_size=50`, timeout riêng 90 giây để kéo lại tin cũ/latest messages; cron/polling nền vẫn dùng skip unchanged để nhẹ tải. Nút sync theo kênh chỉ sync shop đang chọn hoặc shop API đầu tiên, tránh kéo nhiều shop liên tiếp gây timeout/CORS.
- Deploy production: Chat Worker `shophuyvan-chat-api` version `5443eb15-ed1e-4876-a07e-00326b7c65be`; static UI `shophuyvan-analytics` version cuối `1dc584e3-12e0-4861-8a1f-01c09b725095`; không deploy Worker chính `huyvan-worker-api`.
- Test pass: `npm --prefix apps/chat-worker-api test`, `node scripts/check-chat-core-local.mjs`, `node scripts/test-ui-design-system-guard.mjs`, `node --check` cho `apps/fe/js/dashboard/chat/data.js` và `render.js`, kiểm file đã chạm không có chuỗi mojibake.
- Production API pass: Shopee API `166563639` force sync trả `200`, kéo 50 hội thoại, đọc 147 tin, lưu mới 4 tin trong lần kiểm; Shopee no-API `khogiadungcona` trả `200/manual_required`, không còn `HTTP 501`.
- Production UI pass bằng Chrome profile `E:\codex-chrome-profiles\shophuyvan-test`: click `Shopee -> Sync` trả `POST /api/chat/sync` `200` trong khoảng 14 giây, toast `Đã đồng bộ 50 hội thoại, lưu 0 tin mới`, không abort, không CORS, không console error, không `HTTP 501`; shop line hiển thị `Shopee · GIA DỤNG HUY VÂN`.
- Responsive production pass: `node scripts/check-chat-core-browser.mjs` với URL production Chat/CSKH, desktop `1366x900`, tablet `820x1180`, mobile `390x844` đều không tràn ngang, không console/http error, realtime banner ẩn. Screenshots: `artifacts/chat-core/chat-operational-mobile.png`, `chat-operational-tablet.png`, `chat-operational-desktop.png`.
- Còn mở: Shopee SellerChat hiện không trả `customer_name` cho các hội thoại đã kiểm nên tên khách đang là `customer_id`; nếu sau này Open Platform/bridge có field tên khách thật thì Core đã có cột để lưu và UI sẽ tự hiển thị.

### 2026-05-26 - Làm lại Khuyến mãi sàn theo Promotion Core

- Đã đọc guard/docs bắt buộc trước khi sửa: `AGENTS.md`, Core/Warehouse/ADS/Automation/Label/Finance/Order/Product/UI guard, `PROJECT-CURRENT-STATE`, `warehouse-core-map`, `core-data-map`, `marketplace-endpoint-master-checklist`, `marketplace-endpoint-progress`, `python-automation`, `ui-design-system`, `ui-production-checklist`, `shophuyvan-ui-master-prompt`, design tokens và `scripts/test-ui-design-system-guard.mjs`.
- Đã bỏ runtime UI cũ `apps/fe/js/dashboard/promotions.js`; `apps/fe/pages/promotions.html` không còn load IIFE cũ, chuyển sang 6 file mới: `promotions-core.js`, `promotions-api.js`, `promotions-render.js`, `promotions-flash.js`, `promotions-cleanup.js`, `promotions-actions.js`.
- UI mới chỉ render từ Promotion Core/read-model hiện có: `GET /api/discounts/core`, `GET /api/discounts/promotion-module-read-model`, `GET/POST /api/discounts/automation/settings`, `POST /api/discounts/automation/run-now`, `POST /api/discounts/cleanup/action`, `GET /api/discounts/promotion-sku-detail`. Không xoá dữ liệu Core, không xoá route backend active.
- 8 module tiếng Việt đã khóa đúng tên: Shopee Giảm giá, Shopee Voucher, Shopee Combo, Shopee Mua kèm, Shopee Flash Sale, Lazada Voucher, Lazada Freeship, Lazada Flexicombo. UI không còn hiển thị `Shopee Bundle`, `Shopee Add-On`, `Bundle Deal`, `Add-On` hoặc `promotions.js` cũ.
- Shopee Flash Sale tự động đã có bật/tắt, tắt khẩn cấp, nhiều khung giờ theo `id=flash_*`, thêm/xoá/bật/tắt từng khung giờ, product picker nằm ngay dưới khung giờ, tìm SKU, checkbox chọn sản phẩm, nhập Giá Flash Sale/Số lượng inline, group theo khung giờ, lưu luật, chạy ngay và nhật ký. Khi `shopee-flash` chưa có item riêng, picker dùng ứng viên SKU từ Promotion Core Shopee discount items để chọn, vẫn không live-write nếu backend chưa verify.
- Live-write UI không dùng `window.confirm`; các action ghi sàn vẫn gửi `execute:true`, confirm constant nội bộ khi backend yêu cầu, và chỉ coi thành công nếu `verified/readback_match/verify_result.verified` khớp. `run-now` Flash Sale production hiện trả trạng thái an toàn `Flash Sale tự động đang tắt hoặc đang tắt khẩn cấp`, không fake success.
- Dọn chương trình cũ đã tách trong `promotions-cleanup.js`: filter đã kết thúc/không chạy X ngày/không sản phẩm/không doanh thu, danh sách chương trình, nút live-write chỉ theo capability; luôn có lựa chọn `Ẩn khỏi danh sách hoạt động`, không xoá lịch sử Core và không xoá local giả.
- CSS mới `apps/fe/css/dashboard/promotions-page.css` theo Dark Hybrid/mobile-first, skeleton/loading/empty/error, drawer SKU, product picker, selected product group và tone border module. `apps/fe/css/ads/ads-page.css` đã bỏ khối CSS promotion cũ liên quan trực tiếp.
- Test pass: `node --check` 6 file promotion mới, `node scripts/test-promotions-ui.mjs`, `node scripts/test-ui-design-system-guard.mjs`, `npm --prefix apps/fe run lint --if-present`, `npm --prefix apps/fe run build --if-present`, `git diff --check` chỉ còn cảnh báo CRLF sẵn. Worker API không sửa trong lượt này nên không deploy Worker.
- Deploy production static `shophuyvan-analytics` bằng profile `DuAn_shophuyvan-analytics`, Cloudflare account `efe50fab1dd644088d681fb14a4838ae`; version cuối `30de78d2-d9cc-4949-8dd0-11f453465446`, asset cache `promotions-20260526c`.
- Production verification bằng Chrome profile `E:\codex-chrome-profiles\shophuyvan-test`: mở Khuyến mãi sàn không login wall, không load `promotions.js`, đủ 8 module, bấm từng module không lỗi console, không text kỹ thuật `payload/endpoint/request_id/raw response/JSON` trong UI.
- Flash Sale production: thêm khung giờ, mở picker ngay dưới khung giờ, picker có 120 SKU từ Promotion Core candidate, chọn SKU `Mạch Mini+Remote+PIN`, nhập `99.000đ` và số lượng `3`, lưu luật, reload readback thấy schedule/product; sau kiểm đã restore về flash settings ban đầu. `Chạy ngay` không báo success sàn khi chưa live-write verified.
- Cleanup production: bấm `Dọn chương trình cũ` mở panel thật, filter `Đã kết thúc`, 498 dòng, có nút live-write theo capability và nút ẩn local, không có `xóa local giả`.
- Responsive production pass: desktop `1366x900`, tablet `820x1180`, mobile `390x844` đều `overflow=0`, không Console error. Screenshots/evidence lưu ở `artifacts/promotions-20260526/`.

### 2026-05-26 - ADS automation cron/evaluation/executor theo khung giờ

- Guard/docs đã đọc trước sửa: `AGENTS.md`, `shophuyvan-core-first-guard`, `shophuyvan-warehouse-core-guard`, `shophuyvan-automation-guard`, `shophuyvan-label-tracking-core-guard`, `shophuyvan-finance-core-guard`, `shophuyvan-order-core-guard`, `shophuyvan-product-core-guard`, `shophuyvan-ads-core-guard`, `shophuyvan-ui-end-user-guard`, `shophuyvan-ui-design-system-guard`, `PROJECT-CURRENT-STATE`, `warehouse-core-map`, `core-data-map`, `marketplace-endpoint-master-checklist`, `marketplace-endpoint-progress`, `python-automation`, `ui-design-system`, `ui-production-checklist`.
- Backend ADS thêm cron `*/15 * * * *` gọi `runAdsAutomationCron`, đọc `ads_automation_settings.auto_enabled`, kiểm `time_windows` theo UTC+7, `emergency_stop`, `dry_run_mode`, rồi chạy Evaluation Engine và Executor. Log tự động dùng `created_by="automation_cron"` và có summary `shops_processed/campaigns_evaluated/actions_executed/actions_skipped/errors`.
- `ads_automation_settings` được mở rộng các field an toàn: `time_windows`, `dry_run_mode`, `max_campaigns_per_run`, `max_budget_increase_pct`, `max_budget_decrease_pct`, `require_admin_confirm_above_pct`, `emergency_stop`, `shop_key`.
- `apps/worker-api/src/ads/evaluation-engine.js`: phân loại campaign thành `hiệu_quả`, `trung_bình`, `không_hiệu_quả`, `thiếu_dữ_liệu`; không hard-code threshold, đọc từ settings; khóa thiếu giá vốn, tồn thấp, thiếu đủ 3 ngày data, giới hạn số campaign/lần, cap budget và queue `requires_admin_confirm`.
- `apps/worker-api/src/ads/automation-executor.js`: Shopee dùng live-write chính thức `edit_manual_product_ads`/`edit_auto_product_ads` theo campaign type và readback `get_product_level_campaign_setting_info`; chỉ ghi `success` khi readback khớp. Lazada ghi `platform_not_supported_yet`, TikTok ghi `read_only_platform`, không fake thành công.
- Route mới đã thêm: `GET /api/ads/automation/pending-confirms`, `POST /api/ads/automation/confirm-action`, `GET /api/ads/automation/last-run-summary`, `GET /api/ads/automation/logs`. API response không trả raw payload/endpoint/JSON ra UI.
- UI ADS người dùng cuối: `Tổng quan` có 4 KPI, bảng phân loại hiệu quả và thẻ trạng thái automation; `Sản phẩm cần xử lý` có ACOS và cột `Tự động đề xuất`; `Luật tự động ADS` có switch Bật/Tắt, chế độ `Thử nghiệm/Tự động`, chọn ngày trong tuần cho khung giờ, ngưỡng an toàn; `Nhật ký thao tác` có duyệt/từ chối action chờ.
- Test local đã pass: `node --check` các JS mới/sửa, `node scripts/check-oms-core-regression-lock.mjs`, `node scripts/test-ads-automation-engine.mjs`, `node scripts/test-ads-operations-ui.mjs`, `node scripts/test-ui-design-system-guard.mjs`, `npm --prefix apps/fe run lint --if-present`, `npm --prefix apps/fe run build --if-present`, `npm --prefix apps/worker-api test --if-present`, `git diff --check` chỉ còn cảnh báo CRLF sẵn.
- Deploy production bằng profile `DuAn_shophuyvan-analytics`, Cloudflare account `efe50fab1dd644088d681fb14a4838ae`: Worker `huyvan-worker-api` version `4f83f996-9f03-4946-81cc-787469fa7e94`; Static `shophuyvan-analytics` version `507de5c3-7bab-4b71-abc0-b5716bc41e5e`.
- Production dry-run check bằng Chrome profile `E:\codex-chrome-profiles\shophuyvan-test`: tạm bật `automation_enabled=true`, `dry_run_mode=1`, `max_campaigns_per_run=3`, chạy `POST /api/ads/automation/run-now` trả `200`, đánh giá 200 campaign, không gửi sàn, log `automation_run_summary` `created_by=automation_cron`, sau đó khôi phục setting ban đầu `automation_enabled=false`.
- Production live-write sample: tạm bật `dry_run_mode=0`, `max_campaigns_per_run=1` cho sample an toàn Shopee `chihuy1984 / campaign_id=164107991`; automation executor gọi `/api/v2/ads/edit_manual_product_ads` action `pause`, readback `get_product_level_campaign_setting_info` xác nhận success, log `action_id=217`, `created_by=automation_cron`, `live_write_sent=true`. Đã revert ngay bằng ADS guard action `resume`, readback Shopee xác nhận `campaign_status=ongoing`, log `action_id=219`.
- Production UI check: ADS overview có KPI `Chi ADS`, `Doanh thu ADS`, `ROAS TB`, `Lãi sau ADS`, bảng phân loại hiệu quả và trạng thái automation; `Luật tự động ADS` có chế độ `Thử nghiệm/Tự động`, khung giờ, switch Bật/Tắt, nút `Chạy kiểm tra ngay` và `Tắt khẩn cấp`; `Nhật ký thao tác` hiển thị `Tổng kết tự động`, `Tạm dừng chiến dịch`, `Bật lại chiến dịch` không có raw payload/endpoint/request_id/JSON.
- Responsive production đã kiểm desktop `1366x900`, tablet `820x1180`, mobile `390x844`; không tràn ngang (`scrollWidth <= clientWidth` trong check), không `Failed to fetch`, không Console exception. Evidence: `tmp-verification/ads-auto-production-dry-run-sanitized.json`, `tmp-verification/ads-auto-production-live-write-sample.json`, `tmp-verification/ads-auto-production-responsive.json`, screenshots `tmp-verification/ads-auto-desktop.png`, `ads-auto-tablet.png`, `ads-auto-mobile.png`.

### 2026-05-26 - Chỉnh Flash Sale/Cleanup theo phản hồi vận hành

- Khuyến mãi sàn không còn chip/tab riêng `Shopee Flash Sale tự động`; luật tự động được gộp vào đúng module `Shopee Flash Sale` hiện có để tránh trùng luồng và tránh code/caller thừa.
- Switch ADS/Flash Sale đổi sang công tắc 96x40 có chữ Bật/Tắt rõ, trạng thái bật màu xanh, tắt màu xám, disabled nhìn rõ.
- Dọn chương trình cũ đã nối route `POST /api/discounts/cleanup/action`: Shopee Discount/Voucher/Bundle/Add-On/Shop Flash Sale dùng endpoint delete/end chính thức qua Core action hiện có; Lazada Voucher/Freeshipping/Flexicombo dùng endpoint deactivate chính thức. Backend luôn trả `local_delete=false` và chỉ coi thành công khi readback từ sàn khớp.
- Endpoint đã đối chiếu từ Open Platform/local raw docs: Shopee `delete_shop_flash_sale`, `delete_shop_flash_sale_items`, `delete_bundle_deal`, `delete_bundle_deal_item`, `delete_add_on_deal`, `delete_add_on_deal_main_item`, `delete_add_on_deal_sub_item`, `delete_voucher`, `end_voucher`, Discount delete/end; Lazada `/promotion/voucher/deactivate`, `/promotion/voucher/product/sku/remove`, `/promotion/freeshipping/deactivate`, `/promotion/freeshipping/product/sku/remove`, `/promotion/flexicombo/deactivate`, `/promotion/flexicombo/products/delete`.
- Test local đã pass: `node --check` cho Promotions UI/Discount route/Promotion Core, `node scripts/test-ads-operations-ui.mjs`, `node scripts/test-ui-design-system-guard.mjs`, `npm --prefix apps/fe run lint --if-present`, `npm --prefix apps/fe run build --if-present`, `npm --prefix apps/worker-api test --if-present`, `git diff --check` chỉ còn cảnh báo CRLF sẵn.
- Đã deploy production: Worker `huyvan-worker-api` version `0e5d80af-67b7-4142-bb8c-b456cc03a9f5`; Static `shophuyvan-analytics` version `d428d217-7656-4842-b012-881d2f0e73cf`; Cloudflare account `efe50fab1dd644088d681fb14a4838ae`.
- Kiểm production bằng Chrome profile `E:\codex-chrome-profiles\shophuyvan-test`: ADS chỉ còn 4 tab, không còn `Đồng bộ dữ liệu`/`Cài đặt`; mở `Luật tự động ADS`, thêm khung giờ, switch mới hiển thị Bật/Tắt rõ; Khuyến mãi chỉ còn 1 chip `Shopee Flash Sale`, trong module có `Luật tự động Flash Sale`, không còn chip `Shopee Flash Sale tự động`; Dọn chương trình cũ hiện nút `Kết thúc trên sàn`/`Xóa trên sàn` theo endpoint, route dry-run trả endpoint `/api/v2/shop_flash_sale/delete_shop_flash_sale`, `local_delete=false`. Live-write sample với Flash Sale đã kết thúc `144639596756993` trả Shopee `shop_flash_sale_param_error`; đối chiếu raw doc `delete_shop_flash_sale` thấy rule chính thức `cannot delete ongoing and expired shop flash sale`, nên backend/UI đã chặn bằng `endpoint_not_supported_for_expired_flash_sale` và chỉ cho ẩn khỏi danh sách đang hoạt động, không xoá local giả.
- Responsive production đã kiểm desktop `1366x900`, tablet `820x1180`, mobile `390x844`, không tràn ngang. Evidence: `tmp-verification/ads-promo-final-check.json`, `tmp-verification/ads-promo-final-focused-check.json`, screenshots `ads-final-*.png`, `promo-final-*.png`.

﻿# PROJECT CURRENT STATE

Ngày cập nhật: 2026-05-25

File này là bộ nhớ điều phối chính của dự án. Không dùng lịch sử chat dài thay cho file này. Không làm lại phần đã chốt bên dưới nếu không có yêu cầu mới.

## 2026-05-25 - ADS luật tự động và Shopee Flash Sale tự động

- `Đã sửa UI ADS`: bỏ tab `Đồng bộ dữ liệu` và `Cài đặt`; thanh tab ADS chỉ còn `Tổng quan`, `Sản phẩm cần xử lý`, `Luật tự động ADS`, `Nhật ký thao tác`. Nút `Kéo ADS` giữ ở header và kết quả đồng bộ chuyển về nhật ký thao tác.
- `Luật tự động ADS`: chuyển các setting cũ vào màn luật nâng cao gồm bật/tắt tự động, chạy kiểm tra ngay, tắt khẩn cấp, khung giờ chạy, điều kiện đánh giá, campaign tốt/trung bình/kém, thiếu dữ liệu, giới hạn an toàn, campaign tạm dừng và nhật ký tự động gần nhất.
- `Backend ADS`: thêm `GET/POST /api/ads/automation/settings`, `POST /api/ads/automation/run-now`, `POST /api/ads/automation/emergency-stop`; lưu luật vào `ads_automation_settings` và ghi action log vào `ads_action_logs`. Lượt kiểm tra hiện không gửi live-write nếu tự động tắt, ngoài khung giờ hoặc đang tắt khẩn cấp.
- `Khuyến mãi sàn`: thêm mục `Shopee Flash Sale tự động` và `Dọn chương trình cũ`. Flash Sale có bật/tắt tự động, khung giờ, danh sách sản phẩm, điều kiện an toàn và nhật ký; dọn chương trình cũ có filter đã kết thúc/không chạy/không doanh thu/không sản phẩm và không xoá dữ liệu nội bộ để giả vờ đã xoá trên sàn.
- `Backend Khuyến mãi`: thêm `GET/POST /api/discounts/automation/settings`, `POST /api/discounts/automation/run-now`, `POST /api/discounts/cleanup/action`; cleanup action đang khóa an toàn nếu chưa có capability, sample an toàn và readback.
- `Endpoint đã mở kiểm bằng Chrome profile`: đã mở Shopee Open Platform và Lazada Open Platform bằng `E:\codex-chrome-profiles\shophuyvan-test`, CDP port `9333`. Endpoint tham chiếu đang khớp docs/code hiện có: Shopee ADS `edit_manual_product_ads`, `edit_auto_product_ads`, `edit_manual_product_ad_keywords`, readback `get_product_level_campaign_setting_info`; Shopee Shop Flash Sale `get_shop_flash_sale_list/get_shop_flash_sale/get_shop_flash_sale_items/create_shop_flash_sale/update_shop_flash_sale/delete_shop_flash_sale`; Lazada Sponsored Solutions `deleteCampaign/deleteAdgroupBatch`; Lazada Promotion `voucher/freeshipping/flexicombo activate/deactivate/update`.
- `Test hiện tại`: `node --check` pass cho ADS UI, Promotion UI, ADS route và Discount route; `node scripts/test-ads-operations-ui.mjs` pass; `node scripts/test-ui-design-system-guard.mjs` pass.
- `Còn phải làm trước khi báo hoàn thành production`: deploy Worker/static, mở production bằng profile `E:\codex-chrome-profiles\shophuyvan-test`, kiểm ADS lưu/readback luật, chạy kiểm tra ngay, nhật ký mới, Shopee Flash Sale tự động, dọn chương trình cũ và responsive desktop/tablet/mobile. Chưa báo live-write tự động hoàn tất nếu chưa có sample an toàn/readback khớp.

## 2026-05-25 - ADS UI decision table cleanup

- `Đã deploy/kiểm production`: ADS UI được sửa theo rule mới để bỏ icon `?` đại trà khỏi màn chính, không còn badge hành động kiểu `Giảm 30%`, và tách rõ `Vấn đề` với `Hành động`.
- `apps/fe/js/dashboard/ads/ads-end-user-ui.js`: `helpIcon()` không render icon ở ADS main UI; `problemLabel()` và `actionForRow()` map quyết định sang nhãn vận hành như `Không hiệu quả`, `ROAS thấp`, `Thiếu doanh thu ADS`, `Thiếu giá vốn`, `Đang tốt` và action `Tạm dừng`, `Giảm ngân sách`, `Giữ ADS`, `Kiểm giá vốn`.
- `apps/fe/css/ads/ads-page.css`: cột số dùng `.ads-num` căn phải/tabular, Top SKU chuyển thành bảng/card nhỏ có metric riêng, `Việc cần làm hôm nay` dùng grid `overflow:visible`, action row compact.
- `AGENTS.md`, `skills/shophuyvan-ui-design-system-guard/SKILL.md`, `docs/ui-design-system.md`, `docs/ui-production-checklist.md` và `scripts/test-ui-design-system-guard.mjs` đã cập nhật rule: không lạm dụng tooltip/icon chú thích, bảng số liệu phải căn hàng, badge phải nói vấn đề thật và action là nút riêng.
- `Deploy`: Static `shophuyvan-analytics` version `e5f81812-6888-44f0-a687-3b1c379d8be0`; Worker không đổi trong lượt UI này.
- `Production check`: Chrome profile `E:\codex-chrome-profiles\shophuyvan-test`, desktop `1366x900`, tablet `820x1180`, mobile `390x844` đều không tràn ngang, không icon `?`, không `Giảm 30%`, không network fail; `Việc cần làm hôm nay` không scrollbar nội bộ, Top SKU có vấn đề/action riêng, Sản phẩm cần xử lý có cột `Vấn đề` và `Hành động`, số dùng `tabular-nums`. Screenshot: `tmp-verification/ads-clean-final-desktop.png`, `tmp-verification/ads-clean-final-tablet.png`, `tmp-verification/ads-clean-final-mobile.png`.
- `Endpoint rà soát`: Shopee ADS pause/resume đã pass qua `/api/v2/ads/edit_manual_product_ads`; Lazada ADS có `deleteCampaign/deleteAdgroupBatch`; Shopee promotion có delete/end cho Discount/Voucher/Bundle/Add-On và delete Flash Sale; Lazada promotion có deactivate/update/remove theo module. Chưa mở live destructive delete/archive nếu chưa có sample an toàn, admin confirm, action log và readback production.
- `UI debt còn lại`: riêng ADS main UI của lượt này đã sạch theo rule mới. Debt còn lại là endpoint destructive delete/archive chưa được mở live-write vì thiếu sample an toàn/confirm/readback cho từng module; không xoá local để giả vờ xoá trên sàn.

## 2026-05-25 - UI Design System Guard toàn hệ thống

- Đã tạo Skill `shophuyvan-ui-design-system-guard` ở cả repo `skills/shophuyvan-ui-design-system-guard/SKILL.md` và local Codex `C:\Users\Admin\.codex\skills\shophuyvan-ui-design-system-guard\SKILL.md`.
- `AGENTS.md` đã thêm rule ngắn: khi sửa bất kỳ giao diện nào phải đọc `shophuyvan-ui-design-system-guard`; nếu không đọc được thì dừng, không sửa UI; không báo UI pass nếu chưa kiểm đủ desktop/tablet/mobile.
- Đã tạo `docs/ui-design-system.md` và `docs/ui-production-checklist.md` để khóa chuẩn dark theme, token, spacing, typography, card/button/badge/table/drawer/modal/tooltip, responsive và checklist nghiệm thu.
- Đã tạo CSS token chung `apps/fe/css/theme/shophuyvan-design-tokens.css` với các biến `--shv-bg-page`, `--shv-bg-panel`, `--shv-bg-card`, `--shv-border`, `--shv-text-main`, `--shv-text-muted`, `--shv-primary`, `--shv-success`, `--shv-warning`, `--shv-danger`, `--shv-info`, radius/spacing/shadow. Các CSS chính của ADS, OMS, Product Master, Nhập hàng và Chat/CSKH đã import token này để dùng cho lượt sửa tiếp theo.
- Đã thêm test guard `scripts/test-ui-design-system-guard.mjs`: kiểm skill repo/local, AGENTS rule, docs, token bắt buộc, smoke text kỹ thuật trên page, fixed-height/scroll summary card, white background ở dark CSS chính, và loading/empty/error state cho ADS/Khuyến mãi sàn.
- Đã deploy static production `shophuyvan-analytics` version `44b3b473-3b18-4f63-be10-997c09076a65`; Worker không đổi.
- Production quick check bằng Chrome visible profile `E:\codex-chrome-profiles\shophuyvan-test`, CDP port `9333`: ADS, Khuyến mãi sàn, OMS Dashboard, Product Master và Nhập hàng đều không rơi login wall và không tràn ngang ở desktop `1366x900`, tablet `820x1180`, mobile `390x844`. Screenshot sau deploy đã lưu trong `tmp-verification/ui-ds-after-deploy-*.png`; kết quả DOM trước deploy chi tiết ở `tmp-verification/ui-design-system-production-dom-check.json`.

### UI debt phát hiện sau khi áp rule

- ADS: không tràn ngang, không text kỹ thuật, không nền trắng; nhưng network check có `net::ERR_FAILED` ở một số request ADS API/sync trong lúc CDP mở trang. UI không còn hiện `Failed to fetch` trong nội dung kiểm.
- Khuyến mãi sàn: desktop/tablet/mobile không tràn ngang, không text kỹ thuật, không nền trắng, không network fail trong check sau deploy.
- OMS Dashboard: không tràn ngang và không nền trắng, nhưng production vẫn có `Không tải được dữ liệu` và `net::ERR_FAILED` cho `/api/orders/filter-options`, `/api/orders?page=1&limit=200`, `/api/orders/changes?limit=120`; desktop/tablet còn internal scroll lớn ở `.table-wrap`. Chưa được tính UI sạch theo design system.
- Product Master: không tràn ngang nhưng còn nền trắng/light theme ở sidebar/card/input và có `Không tải được dữ liệu` với `/api/products`; mobile còn native select lớn. Chưa được tính UI sạch theo design system.
- Nhập hàng: không tràn ngang, không nền trắng, không `Failed to fetch` text; network check vẫn có `net::ERR_FAILED` cho `/api/purchase/settings` và `/api/purchase/read-model?limit=500`. Cần kiểm sâu ở lượt UI/data riêng trước khi báo sạch.

## 2026-05-25 - ADS/Khuyến mãi sàn chú thích người dùng

- Đã bổ sung hệ thống chú thích người dùng cho ADS và Khuyến mãi sàn: icon `?` cạnh KPI, trạng thái, đề xuất, cột bảng và hành động quan trọng; desktop/tablet mở popover cạnh icon, mobile mở bottom sheet full width.
- ADS `apps/fe/js/dashboard/ads/ads-end-user-ui.js`: có chú thích cho `Tổng chi ADS`, `Doanh thu từ ADS`, `ROAS`, `ACOS`, `SKU cần xử lý`, `Cần dừng ADS`, `Cần giảm ADS`, `Nên tăng ADS`, `Lãi âm`, `Thiếu giá vốn`, `Sắp hết hàng`, `Tồn nhiều cần đẩy`, `Tồn kho`, `Giá vốn`, `Chi ADS`, `Doanh thu ADS`, `Lãi sau ADS`, `Đề xuất`, `Giữ/Giảm/Tắt/Tăng ADS`, `Ngân sách ngày`, `Chi tiêu hôm nay`, `Trạng thái chiến dịch`, `Tạm dừng`, `Bật lại`, `Đổi ngân sách`, `Đổi ROAS mục tiêu`, `Xem trước`, `Áp dụng`.
- Khuyến mãi `apps/fe/js/dashboard/promotions.js`: có chú thích cho `Giá gốc`, `Giá khuyến mãi`, `% giảm`, `Tồn kho`, `Doanh thu từ khuyến mãi`, `Sắp hết hàng`, `Chỉnh giá`, `Tạm dừng chương trình`, `Đồng bộ khuyến mãi`, `Trạng thái`.
- CSS `apps/fe/css/ads/ads-page.css` thêm `.ads-help-*` dùng chung cho popover/bottom sheet, click ngoài đóng, nút `Tôi hiểu`, giữ layout gọn không nhét text dài vào bảng/card. Nội dung chú thích không render `endpoint`, `payload`, `request_id`, `Core`, `cache`, `guard`, `JSON`.
- `scripts/test-ads-operations-ui.mjs` đã khóa contract: KPI chính có icon, ROAS/Missing cost/Ngân sách ngày có nội dung, Khuyến mãi có icon giá/đồng bộ, popover không chứa text kỹ thuật, CSS có popover desktop và bottom sheet mobile.
- Deploy production static `shophuyvan-analytics` version `4296015e-1102-4bc1-b39e-87e94ab44053`; Worker không đổi trong lượt này.
- Production browser verification bằng Chrome profile `E:\codex-chrome-profiles\shophuyvan-test`: ADS bấm icon ROAS, ACOS, Thiếu giá vốn, Đề xuất, Ngân sách ngày, Tạm dừng chiến dịch đều mở đúng nội dung và đóng bằng click ngoài/ESC; Khuyến mãi sàn bấm Đồng bộ khuyến mãi, Giá khuyến mãi, Tồn kho pass. Desktop `1366x900`, tablet `820x1180`, mobile `390x844` không tràn ngang, không request failed, không Console error, không text kỹ thuật. Screenshot lưu `tmp-verification/ads-help-*.png`, `tmp-verification/promotions-help-*.png`.
- Test pass: `node --check apps/fe/js/dashboard/ads.js`, `node --check apps/fe/js/dashboard/ads/ads-end-user-ui.js`, `node --check apps/fe/js/dashboard/promotions.js`, `node scripts/test-ads-operations-ui.mjs`, `npm --prefix apps/fe run lint --if-present`, `npm --prefix apps/fe run build --if-present`; `git diff --check` chạy sau cập nhật docs.

## 2026-05-25 - ADS Điều chỉnh ADS hiển thị đủ sản phẩm và số liệu

- Đã sửa tab `Điều chỉnh ADS`, bước `Chọn chiến dịch`: card campaign trước đó ưu tiên dữ liệu `/api/ads/campaign-guard/campaigns` thô nếu có ảnh, nên tên sản phẩm/SKU/số liệu từ dashboard Product Core không được merge đầy đủ và layout ép chữ vào cột quá hẹp.
- `apps/fe/js/dashboard/ads/ads-end-user-ui.js` dùng `mergeCampaignCatalog(apiRows, dashboardRows)` để giữ ảnh từ API nhưng lấy lại `product_name`, `product_sku`, `spend`, `revenue`, `roas`, `current_cost`, `available_stock`, `shop/platform` từ ADS dashboard/Product Core khi có.
- `apps/fe/css/ads/ads-page.css` đổi card campaign sang layout vận hành: tên sản phẩm tối đa 3 dòng, dưới tên có SKU/shop/Mã ADS, khối số liệu riêng gồm `Chi ADS`, `Doanh thu`, `ROAS`, `Giá vốn`, `Tồn kho`, không còn nền trắng hoặc chữ mất trong card.
- Không phát sinh endpoint Shopee/Lazada mới. Đây là lỗi merge read-model nội bộ + responsive UI, không phải thiếu Open Platform endpoint.
- Deploy production static `shophuyvan-analytics` version `26b2fae5-1e33-4438-aaa5-b1bfd9fb18e1`; Worker giữ version trước đó `7d33375e-705b-4d0b-a12d-fe968ea95cdf`.
- Production browser verification bằng Chrome profile `E:\codex-chrome-profiles\shophuyvan-test`: tab `Điều chỉnh ADS` tải 247 campaign, card đầu hiển thị `Bộ 10 Đôi Đũa...`, SKU `K54HOAANHDAO24CM`, shop `chihuy1984`, Mã ADS `164336113`, `Chi ADS 30.383đ`, `Doanh thu 265.252đ`, `ROAS 8,73`, `Giá vốn 14.145đ`, `Tồn kho 131`, trạng thái `Giữ ADS`.
- Responsive production: desktop `1366x900`, tablet `820x1180`, mobile `390x844` không tràn ngang, Network không có request failed, Console không có lỗi fetch. Screenshot lưu `tmp-verification/ads-adjust-campaign-card-final-desktop.png`, `...-tablet.png`, `...-mobile.png`.
- Test pass: `node --check apps/fe/js/dashboard/ads/ads-end-user-ui.js`, `node scripts/test-ads-operations-ui.mjs`; các gate còn lại chạy sau cập nhật docs.

## 2026-05-25 - ADS bảng sản phẩm dark UI và giá vốn Product Core

- Đã sửa lỗi UI tab `Sản phẩm cần xử lý` bị row trắng khi hover do CSS bảng global đè dark theme. `apps/fe/css/ads/ads-page.css` thêm override riêng cho `.ads-user-table tbody tr:hover` và `td` để nền luôn xanh đậm, chữ sáng.
- Đã sửa nguyên nhân báo thiếu giá vốn hàng loạt: ADS snapshot production không có `product_sku`, chỉ có `campaign_id` và `raw_data.setting_summary.item_id_list`; route cũ dùng campaign id làm SKU nên không nối được Product Core.
- `apps/worker-api/src/routes/ads/dashboard.js` đã nối đường nhẹ: `item_id_list`/SKU ADS -> `product_variations.platform_item_id/platform_sku/internal_sku` -> `products.cost_real/cost_invoice` và `sku_current_cost_read_model.current_cost` nếu có. UI chỉ render field backend trả; không tự tính giá vốn ở frontend.
- Với campaign cấp item có nhiều biến thể, backend gom các variation cùng `platform_item_id`, lấy tồn tổng và giá vốn tham chiếu theo Product Core/Warehouse Core; field thiếu vẫn giữ `null/missing`.
- Production API readback sau deploy: `/api/ads/dashboard?from=2026-05-25&to=2026-05-25` trả `missing_cost=0`, `need_reduce=15`, `keep_ads=7`, `low_stock=3`. Sample `K54HOAANHDAO24CM` trả `current_cost=14145.04`, `stock=131`, source `product_master_reference_cost`; `HV999K241300S` trả `current_cost=24000`; `1_DUI_DEN_428A_K64` trả source `warehouse_purchase_core`.
- Deploy production: Worker `huyvan-worker-api` version `7d33375e-705b-4d0b-a12d-fe968ea95cdf`; Static `shophuyvan-analytics` version `4ccb0121-e711-4fe7-93e6-6b3492741019`.
- Production browser verification bằng Chrome profile `E:\codex-chrome-profiles\shophuyvan-test`: tab `Sản phẩm cần xử lý` dòng đầu hiển thị SKU `K54HOAANHDAO24CM`, tồn `131`, giá vốn `14.145đ`, vấn đề `Đang hiệu quả`, đề xuất `Giữ ADS`; hover row nền `rgb(16,39,70)` và chữ sáng, không còn bảng trắng. Desktop `1366x900`, tablet `820x1180`, mobile `390x844` không tràn ngang, không `Failed to fetch`.
- Test pass: `node --check apps/worker-api/src/routes/ads/dashboard.js`, `node --check apps/fe/js/dashboard/ads/ads-end-user-ui.js`, `node scripts/test-ads-operations-ui.mjs`, `node scripts/check-oms-core-regression-lock.mjs`, `npm --prefix apps/worker-api test --if-present`; `git diff --check` chạy sau cập nhật docs.

## 2026-05-25 - ADS production Failed to fetch triage và hotfix Worker 1102

- Đã tái hiện production bằng Chrome visible profile `E:\codex-chrome-profiles\shophuyvan-test`, DevTools Network/Console trên trang `https://shophuyvan-analytics.nghiemchihuy.workers.dev/pages/ads`.
- Request lỗi thật: `GET https://huyvan-worker-api.nghiemchihuy.workers.dev/api/ads/dashboard?from=2026-05-25&to=2026-05-25...` trả `net::ERR_FAILED`; Network extra info ghi status `503`, CORS `MissingAllowOriginHeader`; direct fetch đọc body Cloudflare HTML `Worker exceeded resource limits`, error code `1102`. Auth `/api/admin/auth/me` vẫn `200`, các static asset không lỗi, không phải 404, không phải mixed deploy static/worker.
- Backend hotfix trong `apps/worker-api/src/routes/ads/dashboard.js`: đường tải mặc định `/api/ads/dashboard` không gọi live account status Shopee và không chạy enrichment Product/Warehouse/Finance Core nặng khi mở màn hình; thêm `lightweightAdsDecisionRows` giữ field thiếu là `null/missing`, không bịa giá vốn/tồn. Enrichment Core chỉ chạy khi request opt-in `include_core_decision_enrichment=1`.
- Frontend hotfix trong `apps/fe/js/dashboard/ads/ads-end-user-ui.js`: bọc lỗi network để UI hiển thị câu dễ hiểu `Không tải được dữ liệu ADS. Vui lòng bấm Làm mới...`, không còn show raw `Failed to fetch`.
- Không phát sinh endpoint Shopee/Lazada mới trong lượt này. Endpoint ADS hiện có vẫn dùng route `/api/ads/dashboard`, `/api/ads/campaign-guard/overview`, `/api/ads/campaign-guard/campaigns`, `/api/ads/sync-campaigns`; nguyên nhân là Worker resource limit khi dashboard gom dữ liệu quá nặng sau sync, không phải thiếu Open Platform endpoint.
- Deploy production bằng profile `DuAn_shophuyvan-analytics`, Cloudflare account `efe50fab1dd644088d681fb14a4838ae`: Worker `huyvan-worker-api` version `d35931bf-b87d-4d72-813d-8fc1042b1005`; Static `shophuyvan-analytics` version `3ea2c63d-c14f-4141-b40f-d80ddecdc832`.
- Probe API production sau deploy: gọi `/api/ads/dashboard?from=2026-05-25&to=2026-05-25` 10 lần liên tiếp đều `200 application/json`, có `Access-Control-Allow-Origin: https://shophuyvan-analytics.nghiemchihuy.workers.dev`, `campaign_snapshot_count=3`, `product_count=24`, không còn 503/1102.
- Production browser verification sau khi đăng nhập lại profile thật: reload ADS, tab `Tổng quan`, `Sản phẩm cần xử lý`, `Điều chỉnh ADS`, `Nhật ký thao tác`, `Cài đặt` đều không có `Failed to fetch`; `Điều chỉnh ADS` tải `/api/ads/campaign-guard/campaigns` `200`; `Kéo ADS` gọi `POST /api/ads/sync-campaigns` `200`, UI hiển thị `Đã quét 432`, `Đã cập nhật 432`, `Không đổi 0`, `Lỗi 0`, sau đó reload dashboard/overview đều `200`.
- Responsive production bằng CDP trên cùng profile thật: desktop `1366x900`, tablet `820x1180`, mobile `390x844` đều không login wall, không `Failed to fetch`, không lỗi ADS load, không tràn ngang.
- Test pass: `node --check apps/worker-api/src/routes/ads/dashboard.js`, `node --check apps/fe/js/dashboard/ads/ads-end-user-ui.js`, `node scripts/test-ads-operations-ui.mjs`, `npm --prefix apps/worker-api test --if-present`, `node scripts/check-oms-core-regression-lock.mjs`. `git diff --check` chạy sau cập nhật docs.
- Còn mở ngoài phạm vi hotfix: nếu muốn dashboard vừa mở nhanh vừa có đủ giá vốn/tồn/lãi sau ADS theo từng SKU, cần tách enrichment Product/Warehouse/Finance sang read-model nền hoặc endpoint chi tiết theo SKU, không nhét lại vào route mở màn hình.

## 2026-05-25 - ADS current-day UI/Core readback hotfix

- Đã đọc guard/docs bắt buộc trước khi sửa: `AGENTS.md`, Core/Warehouse/Automation/Label/Finance/Order/Product/ADS/UI guard, `PROJECT-CURRENT-STATE`, `warehouse-core-map`, `core-data-map`, `marketplace-endpoint-master-checklist`, `marketplace-endpoint-progress`, `python-automation`.
- ADS và Khuyến mãi sàn đã có nút quay về `/`: `apps/fe/pages/ads.html` và `apps/fe/pages/promotions.html` dùng link về `https://shophuyvan-analytics.nghiemchihuy.workers.dev/`.
- ADS UI mặc định đọc ngày hiện tại 2026-05-25, không còn mặc định kéo 7 ngày. Worker cron `apps/worker-api/src/index.js` kéo ADS ngày hiện tại mỗi 5 phút cho Shopee/Lazada để dữ liệu mới tự về nền; UI vẫn có nút kéo thủ công.
- Dashboard ADS đã nối lại read-model theo Core: ưu tiên `sku_current_cost_read_model.current_cost` từ Warehouse/Purchase Core; nếu chưa có lô nhập thì dùng `products.cost_real/cost_invoice` từ Product Core với nguồn `product_master_reference_cost`; UI chỉ render nguồn/cost backend trả, không tự tính. Sau readback còn 4 dòng `missing_cost` là thiếu mapping/giá Core thật, không phải lỗi giao diện.
- `apps/worker-api/src/routes/ads/dashboard.js` enrich ảnh/tên/SKU/tồn/giá vốn từ Product/Warehouse Core, strip `raw_data/raw_setting/raw_metric` khỏi response công khai để tránh payload lớn làm browser fetch fail. `apps/worker-api/src/core/ads/campaign-guard-core.js` enrich catalog chiến dịch bằng product image/item id/stock.
- `apps/fe/js/dashboard/ads/ads-end-user-ui.js` đổi phần chọn chiến dịch thành card/list có ảnh, ưu tiên chiến dịch đang có chi tiêu/đang chạy trong ngày, hiển thị `Ngân sách ngày`, và phần bật/tắt dùng switch thay vì ô gõ chữ. Nếu catalog campaign chưa có ảnh, UI fallback từ dashboard current-day product performance đã enrich ảnh.
- Đã sửa cache/CORS production: Worker trả `Cache-Control: no-store`, `Vary: Origin`; `auth-guard` không gắn `Authorization` cho các GET/HEAD/OPTIONS public read `/api/ads/*`, `/api/discounts/*`, `/api/products/marketplace-preview`; ADS `apiGet` thêm cache-bust `_ads_ts`.
- Deploy production bằng profile `DuAn_shophuyvan-analytics`, Cloudflare account `efe50fab1dd644088d681fb14a4838ae`: Worker `huyvan-worker-api` version `41acdcea-d938-43b9-bcc6-87b140e626a6`; static `shophuyvan-analytics` version `9e85ba51-f13b-4c8a-9e40-f9063e7d5f22`.
- Production API/readback: `POST /api/ads/sync-campaigns` ngày 2026-05-25 trả `job_id=ads_sync_1779678069398`, `scanned_count=432`, `updated_count=432`, `empty_count=1`, `failed_count=0`, `core_readback_ok=true`; `empty_count=1` là Lazada Ads API trả 0 campaign hợp lệ, không phải lỗi. Dashboard current-day trả `need_reduce=11`, `missing_cost=4`, `low_stock=4`, `keep_ads=3`, `sku_action_count=20`; các SKU top như `HV999K241300S`, `BO20TACKE6X32MMK243`, `10_MIENG_MAU_TRANGK55`, `1_DUI_DEN_428A_K64` có ảnh và giá vốn.
- Production browser verification bằng Chrome visible profile `E:\codex-chrome-profiles\shophuyvan-test`: ADS không còn `Failed to fetch`; date input là `2026-05-25`; nút back đúng `/`; overview có ảnh; tab `Sản phẩm cần xử lý` có SKU/ảnh/khuyến nghị; tab `Điều chỉnh ADS` có 16 campaign card và 16 ảnh, có switch trạng thái, card đầu hiển thị `Ngân sách ngày` và khuyến nghị; tab `Đồng bộ dữ liệu` bấm `Kéo ADS` pass với UI log `Đã quét 432`, `Đã cập nhật 432`, `Lỗi 0`. Desktop `1366`, tablet `820`, mobile `390` không tràn ngang.
- Production browser verification Khuyến mãi sàn: `promotions.html` có back về `/`, mobile `390` không tràn ngang, không còn `Failed to fetch`.
- Test pass: `node --check` các file ADS/auth/worker đã sửa, `node scripts/test-ads-operations-ui.mjs`, `node scripts/check-oms-core-regression-lock.mjs`, `npm test --if-present` trong `apps/worker-api`, `npm run lint --if-present` và `npm run build --if-present` trong `apps/fe`.
- Không còn blocker trong phạm vi hotfix ADS UI/data current-day này. Còn 4 dòng thiếu giá vốn cần bổ sung Product/Warehouse mapping hoặc lô nhập thật ở lượt dữ liệu riêng, không vá ở frontend.

## 2026-05-25 - Khuyến mãi sàn action fail và Shopee Flash Sale live-write

- Đã tái hiện production bằng Chrome visible profile `E:\codex-chrome-profiles\shophuyvan-test`: 8 module khuyến mãi đọc được dữ liệu nhưng các nút của Shopee Voucher/Bundle/Add-On/Flash Sale và Lazada module bị frontend chặn bằng toast, gây cảm giác bấm đâu cũng load fail.
- Đã sửa `apps/fe/js/dashboard/promotions.js` và `apps/fe/css/ads/ads-page.css`: chip module wrap không còn scrollbar trắng, toast không chồng quá 2 dòng, action Shopee gọi backend thật, Lazada hiển thị `Chỉ xem dữ liệu` rõ ràng thay vì tạo toast lỗi hàng loạt.
- Backend `apps/worker-api/src/routes/discounts/shopee/promotions/actions.js` thêm `use_cached_payload=true` để lấy payload hiện trạng từ Promotion Core, phục vụ live-write no-change an toàn cho Shopee Voucher/Bundle/Add-On/Flash Sale. `wrangler.toml` bật `SHOPEE_LIVE_WRITE_ENABLED=true`.
- `Promotion Core` action log được expose trong `/api/discounts/core` từ `marketplace_discount_actions`; tab `Nhật ký thao tác khuyến mãi` hiển thị thời gian, sàn, shop, hành động, kết quả, trạng thái gửi sàn và preview/ghi thật, không render raw payload/endpoint/request id.
- Live-write production đã chạy thật: Shopee Flash Sale shop `chihuy1984`, `flash_sale_id=144307500154880`, action `update_shop_flash_sale`, readback `get_shop_flash_sale` verified `true`, before/after không đổi nên không cần revert.
- Blocker còn lại đã có bằng chứng production: Shopee Voucher sample trả `no edit permission for the voucher, shopee backend created voucher`; Shopee Bundle/Add-On sample đang là chương trình `expired`, Shopee từ chối update; Lazada Voucher/Freeship/Flexicombo chưa có adapter payload ghi thật an toàn dù docs endpoint đã được ghi trong checklist.
- Deploy production: Worker `huyvan-worker-api` version `0c01104b-ca57-4b15-ac28-933464d9fdd7`; Static `shophuyvan-analytics` version `54422a1e-b3f3-48b6-a763-cf47623c35ba`; Cloudflare account `efe50fab1dd644088d681fb14a4838ae`.
- Production UI check: tổng quan Khuyến mãi sàn đủ 12 chip, 8 module mở được, Shopee Discount/Voucher/Bundle/Add-On/Flash/Lazada Voucher có data, Lazada Freeship có 2 chương trình và item empty riêng, Lazada Flexicombo empty riêng; desktop/tablet/mobile không tràn ngang, không hiện từ kỹ thuật.
- Test đã chạy pass: `node --check` file sửa, `node scripts/test-ads-operations-ui.mjs`, `node scripts/check-oms-core-regression-lock.mjs`, `npm run lint --if-present` trong `apps/fe`, `npm test --if-present` trong `apps/worker-api`, `git diff --check` phạm vi file sửa.

## 2026-05-24 - Tách ADS quảng cáo và Khuyến mãi sàn theo UI vận hành

- Guard/docs đã đọc trước sửa: `AGENTS.md`, `shophuyvan-core-first-guard`, `shophuyvan-warehouse-core-guard`, `shophuyvan-automation-guard`, `shophuyvan-label-tracking-core-guard`, `shophuyvan-finance-core-guard`, `shophuyvan-order-core-guard`, `shophuyvan-product-core-guard`, `shophuyvan-ads-core-guard`, `shophuyvan-ui-end-user-guard`, `shopee-open-platform-docs`, `PROJECT-CURRENT-STATE`, `warehouse-core-map`, `core-data-map`, `marketplace-endpoint-master-checklist`, `marketplace-endpoint-progress`, `python-automation`.
- ADS UI đã bỏ tab quản lý khuyến mãi `Khuyến mãi & ADS`; ADS chỉ còn `Tổng quan`, `Sản phẩm cần xử lý`, `Điều chỉnh ADS`, `Đồng bộ dữ liệu`, `Nhật ký thao tác`, `Cài đặt`. Tổng quan ADS chỉ giữ khối tham chiếu `Ảnh hưởng khuyến mãi tới ADS` để xem SKU khuyến mãi có chạy ADS, lãi thấp, sắp hết hàng hoặc tồn cao.
- Trang mới `apps/fe/pages/promotions.html` tách riêng `Khuyến mãi sàn`, dark theme/mobile-first theo hình mẫu, có filter ngày/sàn/shop/trạng thái/tìm kiếm, module chips và đủ 8 module: Shopee Discount, Shopee Voucher, Shopee Bundle, Shopee Add-On, Shopee Flash Sale, Lazada Voucher, Lazada Freeship, Lazada Flexicombo.
- Frontend mới `apps/fe/js/dashboard/promotions.js` đọc `Promotion Core` bằng `/api/discounts/core` và read-model module mới `/api/discounts/promotion-module-read-model`; UI không render endpoint/payload/request_id/raw response và có empty state riêng theo từng module.
- Worker thêm read-model module ở `apps/worker-api/src/routes/discounts/common/promotion-browser.js`, expose qua `apps/worker-api/src/routes/discounts/common/route-handler.js`: đọc `marketplace_discounts`, `marketplace_discount_items`, `marketplace_vouchers`, `marketplace_promotion_programs`, `marketplace_promotion_items`, trả program/item/capability người dùng.
- Endpoint docs chính thức đã kiểm trong lượt này: LazOP 2.0 công khai Promotion Tools gồm Seller Voucher, Free Shipping và Flexicombo với các path create/update/get/list/activate/deactivate/add/remove SKU. Shopee path hiện dùng từ code/reference Open Platform nội bộ: Discount, Voucher, Bundle Deal, Add-On Deal, Shop Flash Sale. Chưa mở thêm live-write mới nếu chưa có diagnostics quyền và sample readback an toàn.
- Test đã cập nhật `scripts/test-ads-operations-ui.mjs` để khóa: ADS không còn tab quản lý khuyến mãi, sidebar trỏ `promotions.html`, Khuyến mãi sàn đủ 8 module, có empty state riêng, đọc Promotion module read-model và CSS responsive. Tab `Điều chỉnh ADS` đã bỏ native select dài cho campaign, thay bằng search + danh sách card có trạng thái chọn.
- Đã chạy pass: `node --check apps/fe/js/dashboard/promotions.js`, `node --check apps/fe/js/dashboard/ads/ads-end-user-ui.js`, `node --check apps/fe/js/dashboard/ads.js`, `node --check apps/worker-api/src/routes/discounts/common/promotion-browser.js`, `node --check apps/worker-api/src/routes/discounts/common/route-handler.js`, `node scripts/test-ads-operations-ui.mjs`, `node scripts/check-oms-core-regression-lock.mjs`, `npm --prefix apps/worker-api test --if-present`, `npm --prefix apps/fe run lint --if-present`, `npm --prefix apps/fe run build --if-present`, `git diff --check`.
- Deploy production bằng profile `DuAn_shophuyvan-analytics`, Cloudflare account `efe50fab1dd644088d681fb14a4838ae`: Worker `huyvan-worker-api` version `a637c316-4d53-4198-b20d-ae4f97fc9bf1`; static UI `shophuyvan-analytics` version cuối `8d8cd111-f332-41f8-ba3e-2753f16963e5`.
- Production verification bằng Chrome profile `E:\codex-chrome-profiles\shophuyvan-test`: ADS mở đủ `Tổng quan`, `Sản phẩm cần xử lý`, `Điều chỉnh ADS`, `Đồng bộ dữ liệu`, `Nhật ký thao tác`, `Cài đặt`; không còn `Khuyến mãi & ADS`, không vùng trắng lớn, không thuật ngữ kỹ thuật, campaign selector không còn native select dài.
- Production verification Khuyến mãi sàn: mở `promotions.html`, đủ 8 module, bấm từng module pass; Shopee Discount/Shopee Voucher/Shopee Bundle/Shopee Add-On/Shopee Flash Sale/Lazada Voucher có data read-model, Lazada Freeship và Lazada Flexicombo hiển thị empty state riêng; `Đồng bộ khuyến mãi`, `Nhật ký thao tác khuyến mãi`, `Cài đặt khuyến mãi` pass.
- Responsive production bằng đúng profile `E:\codex-chrome-profiles\shophuyvan-test` pass: ADS và Khuyến mãi sàn ở mobile `390x844`, tablet `820x1180`, desktop `1366x900` không login wall, không tràn ngang, không vùng trắng lớn, không render `endpoint/request_id/payload/Core/cache/guard/JSON/route`. Screenshot lưu ở `tmp-verification/ads-adjust-desktop-20260524.png` và `tmp-verification/promotions-shopee-discount-mobile-20260524.png`.
- Chưa được kết luận hoàn thành e2e cho live-write 8 module; Shopee Discount đã có baseline live-write trước đó, các module còn lại cần quyền app, payload an toàn, sample nhỏ, readback và revert trước khi ghi pass.
- Hotfix production cùng ngày: sửa `promotions.js` để inline button không còn gọi hàm ngoài scope, sync UI dùng lượt nhẹ `include_detail=0` để không làm Worker timeout, và `route-handler.js` bọc lỗi thành JSON có CORS thay vì để UI báo `Failed to fetch`.
- Live-write sample ngay trên màn Khuyến mãi sàn đã pass cho Shopee Discount bằng Chrome visible profile `E:\codex-chrome-profiles\shophuyvan-test`: shop `phambich2312`, chương trình `913787453636608`, item `25068730875`, model `365375191421`, SKU `20 Bộ 5MM X 30MM`, before `39.000đ`, action UI `Áp dụng lại giá`, endpoint chính thức `/api/v2/discount/update_discount_item`, Shopee response `count=1`, readback `verified=true`, Core row `write_status=success`, `promotion_sync_status=synced`, giá sau vẫn `39.000đ` nên không cần revert dữ liệu.
- Production versions sau hotfix: Worker `huyvan-worker-api` version `41353575-aef5-4725-9ba6-8f2595b90c26`; Static `shophuyvan-analytics` version `0af8ccc7-4bf4-46cd-a5e4-9e0048150b8e`. Screenshots: `tmp-verification/promotions-desktop-after-sync.png`, `tmp-verification/promotions-tablet-after-sync.png`, `tmp-verification/promotions-mobile-after-sync.png`, `tmp-verification/promotions-live-write-shopee-discount.png`.

## 2026-05-24 - ADS Core/UI end-user cleanup và live-write guard

- Đã tạo/cập nhật Skill `shophuyvan-ads-core-guard` và `shophuyvan-ui-end-user-guard`; `AGENTS.md` đã thêm rule bắt buộc dùng hai skill này khi sửa ADS/UI.
- Đã thay màn `apps/fe/pages/ads.html` bằng UI người vận hành 7 tab: `Tổng quan`, `Sản phẩm cần xử lý`, `Khuyến mãi & ADS`, `Điều chỉnh ADS`, `Đồng bộ dữ liệu`, `Nhật ký thao tác`, `Cài đặt`. Loader `apps/fe/js/dashboard/ads.js` chỉ nạp `apps/fe/js/dashboard/ads/ads-end-user-ui.js`.
- Đã xoá frontend ADS cũ khỏi runtime và khỏi thư mục `apps/fe/js/dashboard/ads/`: các module cũ Guard/TopPicks/Discount/Promotion/campaign modal/sync render không còn tồn tại. CSS `apps/fe/css/ads/ads-page.css` đã thay bằng bản mobile-first chỉ phục vụ UI mới.
- UI mới không render `payload`, `endpoint`, `route`, `request_id`, `cache`, `guard`, `read-model`, `Core`, `raw response`, `JSON`; các thuật ngữ kỹ thuật nếu backend trả về được đổi sang câu người vận hành trước khi hiển thị.
- Worker ADS thêm ADS Core schema chuẩn trong `apps/worker-api/src/routes/ads/dashboard-metrics.js`: `ads_campaigns`, `ads_adgroups`, `ads_product_links`, `ads_daily_metrics`, `ads_decision_read_model`, `ads_write_capabilities`, `ads_action_logs`.
- `apps/worker-api/src/core/ads/campaign-guard-core.js` ghi thao tác ADS song song vào `ads_action_logs` và upsert `ads_write_capabilities`; mọi capability ghi đều yêu cầu preview, admin confirm và readback.
- Lazada ADS live-write trong `apps/worker-api/src/routes/api-sync/ads/lazada/campaign-actions.js` không còn báo thành công chỉ dựa API response: sau `updateCampaign`/`updateAdgroupBatch` phải gọi readback campaign/adgroup, so ngân sách/trạng thái, mismatch thì trả lỗi user-facing.
- Shopee ADS hiện có endpoint chính thức đã nối: manual product ads edit có readback `get_product_level_campaign_setting_info`; auto/keyword/create vẫn cần kiểm quyền + readback sample trước khi mở rộng kết luận production pass.
- Test contract mới `scripts/test-ads-operations-ui.mjs` khóa: xoá module UI cũ, UI 7 tab, không tự tính `profit_after_ads`, có preview/apply, có đồng bộ, có ADS Core schema, có `ads_action_logs`, CSS responsive.
- Deploy production mới nhất trong lượt ADS Core: Worker `huyvan-worker-api` version `61f2a180-5415-4ff1-8506-6ddc1a2f90c0`, Static `shophuyvan-analytics` version `39011766-de16-4607-820e-c2255b2d6ca4`, Cloudflare account `efe50fab1dd644088d681fb14a4838ae`.
- Production verification bằng Chrome profile `E:\codex-chrome-profiles\shophuyvan-test`: đã mở từng tab ADS, bấm `Kéo ADS`, vào `Điều chỉnh ADS`, preview campaign thật, áp dụng live-write Shopee sample `shop=chihuy1984`, `campaign_id=164859807`, action `pause`, readback Shopee pass, sau đó revert bằng action `resume`, readback Shopee pass.
- Nhật ký thao tác production hiển thị mã thao tác người dùng `#20-#23`, shop, hành động, kết quả và ghi chú dễ hiểu; UI không render `payload`, `endpoint`, `route`, `request_id`, `cache`, `guard`, `read-model`, `Core`, `raw response`, `JSON`.
- Sau live-write đã kiểm lại readback công khai `/api/ads/shopee/product-campaign-settings?shop=chihuy1984&campaign_id_list=164859807`: campaign đang `ongoing`, `campaign_budget=0`, `roas_target=15`; preview mới `#24` không còn gửi field ngân sách thừa khi action là `pause`.
- Desktop production Chrome đang mở kiểm không tràn ngang. Tablet/mobile bằng Chrome tách profile bị login wall nên chưa được tính là verification profile thật trong lượt này; không kết luận responsive tablet/mobile production bằng profile cho phần ADS Core cleanup nếu chưa resize được cửa sổ profile thật.

## 2026-05-24 - ADS UI vận hành theo decision read-model
- Worker `apps/worker-api/src/routes/ads/dashboard.js` enrich `/api/ads/dashboard` thành read-model vận hành: ADS Core (`spend`, `revenue`, `impressions`, `clicks`, `ctr`, `cpc`, `orders`, `roas`, `acos`, `ads_sync_status`, `ads_source`, `last_ads_synced_at`), Product Core (`sku_id`, `seller_sku`, `internal_sku`, `product_name`, `variation_name`, `image_url`, `product_status`), Warehouse Core (`current_stock`, `available_stock`, `current_cost`, `cost_status`, `latest_import_date`), Finance Core (`gross_revenue`, `actual_income`, `profit_before_ads`, `profit_after_ads`, `profit_status`), Promotion Core (`current_price`, `current_promotion_price`, `promotion_status`, `discount_id`, `promotion_source`).
- Backend trả `decision_cards`, `decision_summary`, `sku_action_count`, `recommendation`, `recommendation_reason`, `data_badges`; UI chỉ render các field này, không tự tính lãi sau ADS/ROAS/ACOS/khuyến nghị.
- `POST /api/ads/sync-campaigns` trả log nghiệp vụ cho UI: `job_id`, `scanned_count`, `created_count`, `updated_count`, `unchanged_count`, `empty_count`, `failed_count`, `last_error`, `core_readback_ok`. Lazada/Shopee trả 0 campaign trong khoảng ngày được ghi `empty_count`, không tính là lỗi API.
- Đã sửa lỗi production khi bấm `Kéo ADS`: `normalizeShopeeProductCampaignDailySnapshots is not defined` trong Shopee ADS sync probe; thêm binding normalizer và contract test để khóa lại.
- Test contract mới: `scripts/test-ads-operations-ui.mjs` khóa ADS summary, decision cards, UI không tự gán `profit_after_ads`, mobile card list và log kéo ADS.
- Production deploy bằng profile `DuAn_shophuyvan-analytics`, Cloudflare account `efe50fab1dd644088d681fb14a4838ae`: Worker `huyvan-worker-api` version cuối `cc96a278-de20-4f91-9079-231de1f07191`; static UI `shophuyvan-analytics` version cuối `ce43a2ba-1b1a-4a98-8c9c-3251d45c81f0`.
- Production verification bằng Chrome visible profile `E:\codex-chrome-profiles\shophuyvan-test`: desktop `1366x900`, tablet `820x1180`, mobile `390x844` không tràn ngang; header chỉ hiện `Hôm nay`, `7 ngày`, `Tháng này`, date range, `Làm mới`, `Kéo ADS`; mobile dùng card SKU và drawer fullscreen.
- Kéo ADS production pass: log `job_id=ads_sync_1779611291216`, `scanned_count=3024`, `updated_count=3024`, `unchanged_count=0`, `empty_count=1`, `failed_count=0`, `core_readback_ok=true`; UI status line `162 SKU · 0 lỗi · Nguồn: Shopee/Lazada Ads API`.
- Browser action pass: bấm `Làm mới`, bấm `Kéo ADS`, click card `Cần dừng ADS` lọc bảng, reset filter, mở SKU drawer; drawer có đủ tabs `Hiệu quả ADS`, `Giá & tồn kho`, `Lịch sử ADS`, `Khuyến nghị`, `Nguồn dữ liệu`.

## 2026-05-24 - Purchase/Warehouse Core nguồn chuẩn giá vốn theo lô

- Lượt tiếp theo trong ngày đã chuẩn hóa trang nhập hàng về kho chung: UI không còn filter shop, cột shop hoặc text làm hiểu tồn/giá vốn tách theo shop. `warehouse_sku/internal_sku` là khóa kho; `seller_sku` chỉ là tham chiếu bán sàn.
- Purchase Core mở rộng logistics profile theo SKU trong `product_logistics_profiles`: `sku_id`, `internal_sku`, `package_length_cm`, `package_width_cm`, `package_height_cm`, `package_weight_kg`, `package_volume_m3`, `default_quantity_per_package`, `shipping_calculation_method`, `logistics_profile_source`, `logistics_profile_status`, `last_logistics_profile_updated_at`.
- Purchase batch/import shipment chuẩn hóa theo đợt nhập trong `purchase_batches`: `import_batch_id`, `batch_code`, `forwarder_name`, `container_or_waybill_no`, `shipment_status`, `customs_declaration_no`, `customs_declaration_date`, `invoice_no`, tổng kiện, tổng số lượng, tổng kg, tổng khối, tổng giá trị hàng, tổng phí ship, tổng thuế, tổng landed cost.
- `purchase_batch_items` thêm thông số kiện/vận chuyển theo dòng: `line_no`, `package_length_cm`, `package_width_cm`, `package_height_cm`, `package_weight_kg`, `package_volume_m3`, `total_weight_kg`, `total_volume_m3`, `shipping_calculation_method`, `allocated_shipping_per_unit`, `allocated_tax_per_unit`, `allocated_other_fee_per_unit`, `forwarder_name`, `invoice_no`, `customs_declaration_no`, `link_nhap_hang`, `cong_dung`, `chat_lieu`, thông tin chỉnh sửa gần nhất.
- `inventory_cost_layers` thêm `purchase_batch_item_id`; `purchase_batch_revisions` lưu `before_payload`, `after_payload`, `changed_fields`, `edited_by`, `edited_at`, `edit_reason` khi sửa dữ liệu nhập sai.
- Route mới/sửa: `GET/PATCH /api/purchase/logistics-profile`, `GET /api/purchase/import-batches`, `GET /api/purchase/import-batch`, `PATCH /api/purchase/batch-item-edit`, `GET /api/purchase/revisions`; route ghi yêu cầu admin/manager/warehouse qua auth.
- Công thức phí vận chuyển nằm trong Core: `package_volume_m3 = D*R*C/1000000`; `total_weight_kg = package_count*package_weight_kg`; `total_volume_m3 = package_count*package_volume_m3`; `by_weight` dùng tổng kg; `by_volume` dùng tổng khối; `greater_of_weight_or_volume` dùng `max(total_weight_kg, total_volume_m3*volumetric_factor)`; `fixed_per_package` dùng số kiện; `manual` dùng phí nhập tay. `formula_snapshot` lưu đầy đủ method, kiện, kg, khối, hệ số quy đổi, basis, phí phân bổ và landed cost.
- UI `apps/fe/pages/admin-purchase.html`, `apps/fe/js/admin/purchase-manager.js`, `apps/fe/css/admin/admin-purchase.css` thêm tab `Danh sách sản phẩm`, `Đợt nhập hàng`, `Tờ khai / hồ sơ vận chuyển`; bảng sản phẩm có cột `Thông số kiện`; drawer có tab `Thông tin chung`, `Lịch sử nhập hàng`, `Thông số kiện hàng`, `Lớp tồn kho & giá vốn`, `Lịch sử chỉnh sửa`.
- Import Excel hỗ trợ thêm `package_length_cm`, `package_width_cm`, `package_height_cm`, `package_weight_kg`, `shipping_calculation_method`; nếu SKU có logistics profile thì dùng mặc định cho field thiếu; nếu thiếu field bắt buộc thì block `missing_package_weight`, `missing_package_dimensions`, `invalid_shipping_calculation_method`.
- Vendor local cho trang nhập hàng: `apps/fe/js/vendor/xlsx.full.min.js`, `apps/fe/js/vendor/jspdf.umd.min.js`, `apps/fe/js/vendor/jspdf.plugin.autotable.min.js`, `apps/fe/js/vendor/lucide.min.js`; bỏ phụ thuộc CDN để export/icon chạy ổn trên production.
- Production deploy lượt kho chung/logistics: Worker `huyvan-worker-api` version cuối `a665fd10-a92e-4a64-aedf-a611f2836d84`; static UI `shophuyvan-analytics` version cuối `cd50ec09-1b60-418a-adb8-471d5085d5f2`.
- Production verification bằng Chrome profile `E:\codex-chrome-profiles\shophuyvan-test`: trang không còn filter/cột shop; read-model Product Core trả 207 SKU; sample `400348_100_DAY_DAI_200MM` hiện `no_purchase_history`, `logistics_profile_status=missing`, `current_cost=null`; manual preview theo kg pass, không ghi DB.
- Production import preview API pass: 3 row sample trả `ready=1`, `blocked=2`; block reasons `sku_not_found_in_product_core` và `missing_import_date`; row ready có `shipping_calculation_method=by_weight`, `total_weight_kg=1.2`, `landed_cost_per_unit=12440`.
- Production import batch readback pass: batch `657d4001-931a-4ca7-9439-ee33bdf96307` aggregate từ Purchase Core ra `total_package_count=3`, `total_quantity=300`, `total_landed_cost=6088500`, item `1_DUI_DEN_428A_K64`.
- Production UI batch detail pass: mở tab `Đợt nhập hàng`, bấm `Chi tiết`, drawer hiện tổng kiện/tổng giá vốn/danh sách SKU; export `PackingList` và `ToKhai` hiện toast xuất file thành công từ Purchase Core.
- Responsive production pass bằng Chrome profile `E:\codex-chrome-profiles\shophuyvan-test`: desktop `1366x900`, tablet `820x1180`, mobile `390x844` không tràn ngang; mobile/tablet dùng card list, drawer fullscreen rule bật dưới 900px.
- Test pass lượt kho chung/logistics: `npm test` trong `apps/worker-api`; `npm run lint --if-present` và `npm run build --if-present` trong `apps/worker-api`; `npm run lint --if-present` và `npm run build --if-present` trong `apps/fe`; `node --check` các JS sửa; `git diff --check` không có whitespace error.
- Chưa nghiệm thu ghi production với lô nhập thật trong lượt kho chung nếu không có dữ liệu nhập thật được duyệt; không tự tạo giá vốn giả cho SKU thật.
- Đã làm lại trang `apps/fe/pages/admin-purchase.html` thành “Quản lý nhập hàng chính ngạch” dark theme theo Product Core, mobile first, có summary, filter, bảng desktop, card mobile, drawer chi tiết, tab lịch sử nhập hàng, lớp tồn kho & giá vốn, công thức tính giá, báo cáo, import preview, thêm lô nhập thủ công, xuất Excel/PDF, tỉ giá & phí ship.
- Worker thêm Purchase/Warehouse Core tại `apps/worker-api/src/core/purchase/purchase-core.js` và route `apps/worker-api/src/routes/purchase/index.js`: `GET /api/purchase/read-model`, `GET /api/purchase/history`, `POST /api/purchase/import-preview`, `POST /api/purchase/import-confirm`, `POST /api/purchase/manual-preview`, `POST /api/purchase/manual-confirm`, `GET /api/purchase/export`, `GET/PATCH /api/purchase/settings`.
- Schema/read-model chuẩn: `purchase_batches`, `purchase_batch_items`, `inventory_cost_layers`, `sku_current_cost_read_model`, `settings_import`. `sku_current_cost_read_model.current_cost` dùng `weighted_average_remaining_stock`, tính bằng `sum(quantity_remaining * landed_cost_per_unit) / sum(quantity_remaining)`.
- Product Core fields dùng trong trang nhập hàng: `product_id`, `sku_id/internal_sku`, `seller_sku`, `product_name`, `variation_name`, `image_url`, `category`, `shop_key`, `platform`, `product_status`. SKU không match Product Core bị block `sku_not_found_in_product_core`; không tự tạo SKU mới.
- Import Excel/Manual preview tính `landed_cost_per_unit` ở Worker, lưu `formula_snapshot`, chặn rõ `missing_import_date`, `missing_sku`, `sku_not_found_in_product_core`, `invalid_quantity`, `missing_purchase_price`; preview không ghi DB.
- Production deploy bằng profile `DuAn_shophuyvan-analytics`, Cloudflare account `efe50fab1dd644088d681fb14a4838ae`: Worker `huyvan-worker-api` version cuối `4dc21f7f-e738-4fd4-b003-0ae1f39c120a`; static UI `shophuyvan-analytics` version `fd5f6bd6-6cbd-4e10-aa21-3578641ceb45`.
- Production readback `GET /api/purchase/read-model?limit=20` pass: `source=warehouse_purchase_core`, sample `400348_100_DAY_DAI_200MM`, `purchase_history_status=no_purchase_history`, `current_cost_status=missing`; sản phẩm chưa có lịch sử vẫn hiện trong UI.
- Production preview pass bằng Chrome profile `E:\codex-chrome-profiles\shophuyvan-test`, user role `admin`: row hợp lệ `ready`, row thiếu ngày bị `missing_import_date`, row SKU không có Product Core bị `sku_not_found_in_product_core`; manual preview sample cũng `ready`; export endpoint trả 20 dòng.
- Export UI production pass: Excel tạo `HuyVan_NhapHangCore_2026-05-24.xlsx`; PDF tạo blob `application/pdf` và toast `Đã xuất PDF theo filter hiện tại`.
- Responsive production pass bằng Chrome profile `E:\codex-chrome-profiles\shophuyvan-test`: desktop `1366x900` dùng table, tablet `820x1180` và mobile `390x844` dùng card list, drawer fixed/fullscreen khi mở, `documentElement` không tràn ngang. Screenshot kiểm: `tmp-purchase-desktop.png`, `tmp-purchase-tablet.png`, `tmp-purchase-mobile.png`.
- Tests pass: `npm --prefix apps/worker-api test`; `npm --prefix apps/worker-api run lint --if-present`; `npm --prefix apps/worker-api run build --if-present`; `npm --prefix apps/fe run lint --if-present`; `npm --prefix apps/fe run build --if-present`; `node --check` các file JS đã sửa; `git diff --check` phạm vi Purchase Core không lỗi whitespace.
- Chưa gọi `confirm import` hoặc `confirm manual` với row hợp lệ trên production vì chưa có lô nhập thật/số giá vốn thật được duyệt; tự tạo giá vốn giả sẽ làm sai `current_cost` của SKU thật. Cần user cung cấp file/lô nhập an toàn hoặc xác nhận SKU + giá + số lượng thật trước khi nghiệm thu ghi DB end-to-end.

## 2026-05-24 - TikTok no-API upload giá KM qua Seller Center

- Đã nối luồng TikTok no-API `0909128999` upload giá khuyến mại bằng local runner `E:\shophuyvan-python-automation\oms_python\platforms\tiktok\promotion\upload.py`, thao tác thật trên Seller Center discount edit `7614469433056216853`: bấm `Chọn sản phẩm`, chuyển `Tải lên hàng loạt`, tải mẫu/ID sản phẩm, điền file `Product Discount.xlsx`, upload lại, bấm `Nhập` và `Đồng ý và đăng`.
- Product Master tab Giá khuyến mãi có ô `Link chương trình TikTok` và nút `Lưu link TikTok`; link được lưu trong Product Catalog settings `tiktok_promotion_urls.0909128999`, nên khi TikTok đổi chương trình mỗi 3 tháng chỉ cần dán link mới trên UI, không sửa code.
- Runner kiểm SKU ID kỹ bằng file ID sản phẩm mới nhất `Tiktoksellercenter_batchedit_20260523_all_information_template.zip`. Nếu cùng seller SKU xuất hiện ở nhiều `product_id/sku_id`, runner bỏ qua với `ambiguous_tiktok_sku_id` thay vì đoán. Sample `40TACKE6X32MMK243` resolve đúng `product_id=1730655569230465831`, `sku_id=1733420946916607783`, giá KM `50.000đ`, tồn `1`.
- Job full-shop `2827` chạy thật bằng Chrome visible/headful profile `E:\shophuyvan-python-automation\profiles\browser\shophuyvan-runner-tiktok`, `headless=false`, kết thúc `completed`: `ready_rows=131`, TikTok xác nhận `uploaded=73`, `skipped=58` do `Sku_id bị trùng lặp`, `failed=0`, `out_of_stock=0`. Các lỗi hết hàng TikTok nếu xuất hiện được phân loại hợp lệ `out_of_stock`, không tính failed.
- Product/Warehouse Core readback sau job `2827`: `/api/sync-variations?platform=tiktok&shop=0909128999&include_out_of_stock=1` trả `234` dòng, trạng thái upload `uploaded=73`, `skipped=58`, chưa có trạng thái `103`. Sample `40TACKE6X32MMK243` hiển thị `Bỏ qua`, message `Sku_id bị trùng lặp`, job `2827`, giá upload `50.000đ`.
- Product Master production đã kiểm bằng Chrome profile `E:\codex-chrome-profiles\shophuyvan-test`: chọn tab `Kết nối & Đồng bộ > Giá khuyến mãi`, sàn `TikTok`, shop `0909128999`; UI hiện link chương trình, badge từng dòng `Đã up sàn`/`Bỏ qua`, dòng mẫu `40TACKE6X32MMK243` hiện `Bỏ qua`. Kiểm desktop `1440x883`, tablet `820x1180`, mobile `390x844` không tràn ngang.
- Kiểm nút UI tạo job thật: Product Master tạo job `2824` từ nút `Preview đẩy giá lên sàn`, runner chạy visible và kết thúc `completed_no_change` vì dòng đã trùng SKU trong chương trình. Sau đó sửa runner để job chọn một phần không xóa trạng thái upload của các SKU khác; chỉ job full-shop mới `clear_existing`.
- Job `2825` từng failed do Chrome automation cũ giữ CDP port `9331`; đã đóng đúng browser automation qua CDP `Browser.close`, không `taskkill chrome.exe`, rồi chạy lại job full-shop `2827` pass.
- Deploy production: Worker `huyvan-worker-api` version `a39d79f7-9980-4d78-b3fb-d0d702a97870`; static UI `shophuyvan-analytics` version `24e6c980-8ac2-4c6f-a795-5a1cc9d09b34`.
- Tests pass: `npm test` trong `apps/worker-api`; `node --check` các file Product Master/Worker liên quan; `python -m py_compile` runner TikTok và report runner; `git diff --check` trong phạm vi file sửa không có whitespace error.

## 2026-05-24 - Shopee no-API khogiadungcona upload giá KM và badge từng dòng

- Đã upload lại file giá KM Shopee no-API `khogiadungcona` bằng local runner thật, job `2715`, Chrome visible/headful profile `E:\shophuyvan-python-automation\profiles\browser\HuyVan_Bot_Data_khogiadungcona`, `headless=false`.
- Seller Center trả đúng kết quả thực tế `114/131` và trạng thái `Chỉ một số sản phẩm thành công`; report tải về `E:\shophuyvan-runtime\downloads\shopee_khogiadungcona_promo_upload_report_20260524_064325.xlsx` parse ra `uploaded=114`, `out_of_stock=17`, `failed=0`.
- Quy tắc nghiệm thu mới cho Shopee no-API promotion upload: nếu tất cả dòng không thành công đều là `Hết hàng` thì đây là kết quả hợp lệ và job được ghi `completed`; nếu có lỗi khác ngoài `Hết hàng` thì vẫn ghi `failed`.
- Worker thêm route `POST /api/products/promo-upload-results` để ghi trạng thái upload từng dòng vào Product/Warehouse Core (`promo_upload_status`, `promo_upload_message`, `promo_upload_file`, `promo_upload_job_id`, `promo_upload_price`, `promo_upload_at`). Route match theo `platform_sku`/`model_id`; chỉ fallback `item_id` khi thiếu SKU và model để tránh cập nhật nhầm cả sản phẩm nhiều phân loại.
- Product Master read-model `/api/sync-variations` trả các field trạng thái upload; UI tab Giá khuyến mãi hiển thị badge kế bên từng dòng: `Đã up sàn`, `Hết hàng`, `Lỗi upload`, `Bỏ qua`.
- Core/API readback sau ghi report: file report nhận `accepted=131`, `updated=116`, counts `uploaded=114`, `out_of_stock=17`, `failed=0`; Product Master read-model hiện `uploaded=103`, `out_of_stock=12` trên các variation đang có trong Product Core.
- Sample production readback: `40TACKE5X30MM` hiện `Đã up sàn`; `40TACKE6X32MMK243` hiện `Hết hàng`; `TAPDENHIXANHK07` và `TAPDENHIVANGK07` hiện `Hết hàng`.
- UI production đã kiểm bằng Chrome profile `E:\codex-chrome-profiles\shophuyvan-test`, URL cache-bust `admin-products.html?v=promo-upload-status-20260524#tab-shops`: shop `khogiadungcona` render badge trong tab Giá khuyến mãi. Responsive pass desktop `1366x900`, tablet `820x1180`, mobile `390x844`, không tràn ngang.
- Deploy production: Worker `huyvan-worker-api` version `006defda-46d1-46c9-883d-55fc8ca6de62`; static `shophuyvan-analytics` version `a0775c22-79f5-4e3d-b14f-8a43747bc341`.
- Tests pass: `npm test` trong `apps/worker-api`; `node --check` các route JS đã sửa; `python -m py_compile E:\shophuyvan-python-automation\oms_python\platforms\shopee\promotion\shopee_promo.py E:\shophuyvan-python-automation\oms_python\features\reports\run_report_jobs.py`; `git diff --check` không có whitespace error.

## 1. Core/Warehouse đã chốt

### Shop Core

- `chihuy1984` = Shopee API.
- `chihuy2309` = Shopee API.
- `phambich2312` = Shopee API.
- `kinhdoanhonlinegiasoc@gmail.com` = Lazada API.
- `khogiadungcona` = Shopee no-API / Seller Center fallback.
- `0909128999` = TikTok local helper / Seller Center fallback.

### Order Core

- `orders_v2` là nguồn đơn chính.
- Read Core trả Order Core fields cho OMS/Chat/Dashboard/Export.
- Không để OMS tự map trạng thái/source riêng.

### Status Core

- Field chuẩn: `order_status_core`, `fulfillment_status_core`, `display_status_vi`, `terminal_status`, `label_eligible`.
- Return/completed không được hiểu sai thành đã giao.

### Finance Core

- `gross_revenue`, `buyer_paid`, `actual_income`, `estimated_income`, `profit_basis` phải tách rõ.
- Không trừ voucher shop hai lần.
- Không fake `actual_income`.
- Thiếu settlement thì dùng `Lãi tạm tính`, không gọi `Lãi thực`.
- Lazada thiếu settlement không gọi `Lãi thực`.
- TikTok chưa có settlement thật thì `actual_income=null`, dùng `Thực nhận tạm tính`.

### Label Core

- Route chuẩn: `/api/label/:orderId/refresh`.
- Route legacy `/api/labels/refresh/*` trả `410`.
- Shopee API dùng flow chứng từ in/waybill chính thức.
- Lazada dùng API AWB/document nếu có.
- Không gọi `ship`, `arrange`, `confirm`, `cancel`.

### Tracking Core

- Drawer Theo dõi đọc từ Tracking Core.
- Nếu có `tracking_events` thì không hiện `Chưa có lịch trình`.
- Shopee/Lazada API phải dùng Open Platform tracking endpoint nếu có.
- Timeline nội bộ chỉ là fallback và phải ghi rõ.

### Chat

- Chat legacy đã bị decommission.
- Chat mới dùng Chat Worker.
- OMS `Nhắn khách` phải đi Chat mới/Core.
- Shopee/Lazada API chat phải kiểm route chính thức.
- TikTok nếu chưa có chat API thì manual/local helper rõ, không fake success.

## 2. Route/file chuẩn hiện tại

- Shop Core: `/api/core/shops`.
- Order list/runtime OMS: `/api/orders`.
- Order changes: `/api/orders/changes`.
- Order Core: `/api/core/orders/*`.
- Label refresh một đơn: `/api/label/:orderId/refresh`.
- Label retry batch: `/api/label/retry-failed`.
- Manual/no-API backfill: `/api/orders/manual-sync/backfill`.
- Status sync nếu bật: `/api/orders/status/sync`.
- Tracking Core routes: kiểm trong `apps/worker-api/src/routes/core-data` và Order read model.
- Chat Worker routes: `/api/chat/*` trên Worker Chat mới; Worker chính `/api/chat/*` legacy trả `410`.
- Finance Core routes: `/api/order-analytics/finance-core`, `/api/profit-by-day`, `/api/revenue-by-day`, `/api/dashboard`, `/api/export-orders`.
- Bot/Radar settings routes: `/api/bot/settings`, local helper `http://127.0.0.1:8765`.
- TikTok runner state: `E:\shophuyvan-runtime\runner-control\tiktok\`.
- Auto order scheduler state: `E:\shophuyvan-runtime\auto-order-scheduler\`.

## 3. Source routing chuẩn

- `chihuy1984` -> API.
- `chihuy2309` -> API.
- `phambich2312` -> API.
- `kinhdoanhonlinegiasoc@gmail.com` -> Lazada API.
- `khogiadungcona` -> Shopee Seller Center fallback.
- `0909128999` -> TikTok Seller Center/local helper fallback.

Cấm:

- `chihuy1984`, `chihuy2309`, `phambich2312` đi Seller Center fallback.
- Lazada API shop bị coi là manual.
- TikTok fake API.

## 4. Automation/Radar hiện tại

- Shop API tự sync nền bằng Worker/API/Cron/Webhook, không phụ thuộc Radar.
- Radar/local helper chỉ cho Shopee no-API/TikTok fallback.
- Modal auto phải có `last_run`, `next_run`, `result`, `error`.
- TikTok từng bị pause vì runner loop/ảnh hưởng Chrome user.
- Thiết kế cuối: TikTok được auto theo lịch nếu an toàn, không manual-only vĩnh viễn.
- TikTok phải dùng profile automation riêng.
- Không dùng Chrome profile user.
- Không kill `chrome.exe` toàn cục.

## 5. Các lỗi đã xử lý

- 2026-05-23 Promotion/Product Core:
  - R2 upload cho bot tải file khuyến mại Shopee no-API đã sửa: Worker có secret `SHV_LOCAL_RUNNER_TOKEN`; Python `upload_to_r2()` có fallback xin `/api/upload-url`; kiểm thật upload `debug/codex_r2_promo_upload_test_20260523.xlsx` thành công.
  - TikTok giá khuyến mại đã có scraper riêng `E:\shophuyvan-python-automation\oms_python\platforms\tiktok\promotion\tiktok_promo_scrape.py`, đọc tab Seller Center promotion bằng profile `E:\shophuyvan-python-automation\profiles\browser\shophuyvan-runner-tiktok`, ghi về Product/Warehouse Core qua `/api/products/update-promo-prices`.
  - TikTok production đã chạy thật trên URL discount `7614469433056216853`: scrape 158 dòng giá ưu đãi, ghi 4 lô, D1 readback 106 variation khớp model/SKU; Product Master production hiện 148 SKU TikTok, 129 SKU có giá KM hiện tại.
  - Product Master `Giá khuyến mãi` đã đổi bulk đúng nghĩa: tick “Chọn tất cả SKU đang lọc” rồi áp dụng % cho toàn bộ tập đã chọn, không chỉ 120 dòng đang render. Chrome profile `E:\codex-chrome-profiles\shophuyvan-test` kiểm mobile `390x844`, tablet `820x1180`, desktop `1440x939` không tràn ngang cấp trang.
  - Product Master preview Shopee API đã đọc Promotion Core và hiển thị `discount_id/item_id/model_id/endpoint/readback`. Phambich đã sync Shopee Discount read-only qua `/api/v2/discount/get_discount_list` + `/api/v2/discount/get_discount`, lưu 1 discount và 138 item.
  - Lưu ý mở: Product Master rows của `phambich2312` còn lệch mapping item/model với cache Shopee Discount ở một số SKU, ví dụ SKU đang hiển thị `1_dui_den_428a_H64` map vào `bundle_deal` chứ không phải Discount; chưa được phép coi là sẵn sàng live-write cho các SKU đó cho đến khi Product Core sync lại listing/model hiện hành.
  - Worker deploy mới nhất: `huyvan-worker-api` version `33b19741-e098-4e6c-9b11-39160249cc8c`; static UI deploy `shophuyvan-analytics` version `ff0fd41c-b7c1-40d9-b40f-ef9a57e7d517`.
- Chat legacy removed / `410`.
- Product tab/chat product card restored bằng flow mới.
- Finance taxonomy voucher/shop discount fixed.
- Duplicate exact `order_items` fixed.
- Shop display raw ID fixed.
- Order Status Core phase 2 done.
- Label capability/read-only done.
- Auto label/label retry panel done.
- Shopee API label document flow fixed.
- Lazada subrequest batch fixed.
- OMS resync panel dropdown shop fixed.
- Lazada lãi thực/tạm tính mâu thuẫn fixed.
- Tracking drawer mâu thuẫn fixed.
- Stale Seller Center error trên API shop fixed.
- Auto scheduler diagnostic fixed.
- 2026-05-20: `AGENTS.md` và Skill `shophuyvan-warehouse-core-guard` đã thêm Endpoint First / Project State / Browser Automation Safety.
- 2026-05-20: TikTok pending settlement giữ `actual_income=null`, `actual_income_available=false`, `actual_income_confidence=none`, popup OMS hiển thị `Thực nhận tạm tính` và `Lãi tạm tính`.
- 2026-05-20: Lazada thiếu settlement hiện popup phí chi tiết từ Finance Core với `Thiếu dữ liệu Finance API`, `Thực nhận tạm tính`, `Lãi tạm tính`; không gọi cost setting là confirmed.
- 2026-05-20: Tracking drawer dùng endpoint thật Shopee `/api/v2/logistics/get_tracking_info`, Lazada `/logistic/order/trace`; TikTok ghi `tiktok_manual_or_local_helper` nếu cần Seller Center/local helper.
- 2026-05-20: OMS `/api/orders?limit=200` production pass; response cắt `fee_raw_data`, tracking enrich batch đã hạ kích thước, frontend thêm last-good cache cho orders/badges khi fetch lỗi.
- 2026-05-20: OMS `Nhắn khách` Shopee/Lazada đi Chat Worker mới; Shopee gửi thử `ok` thành công, Lazada mở đúng chat nhưng gửi fail rõ `missing_session_id`, TikTok giữ manual/local helper không fake success.

## 6. Các lỗi còn mở

- TikTok auto `codex_hotfix_final_pause` đã được xử lý lại ở mục 13: pause cũ đã clear, scheduler không còn hard-skip vì reason này; mọi trạng thái TikTok mới phải đọc theo runtime hiện tại, không theo snapshot lỗi cũ.
- Lazada Chat API đã sync read-only `/im/session/list`, `/im/message/list` nhưng order `525472804102182` còn thiếu `session_id` chính thức nên chưa gửi live được.
- Lazada tracking endpoint `/logistic/order/trace` đã gọi được nhưng order `525472804102182` trả rỗng; drawer ghi rõ nguồn endpoint và fallback timeline vận hành nội bộ.
- Chrome profile user ở tab mới CDP có lúc chặn CORS `Failed to fetch`; tab OMS đang chạy thật vẫn tải dữ liệu. Frontend đã có last-good cache, cần theo dõi thêm nếu user gặp lại ở thao tác thường.
- Code/Python legacy cần audit trước khi xoá.

## 7. Permanent rules

- Với shop có API, thiếu endpoint/field thì bắt buộc tra Open Platform trước.
- Không báo thiếu endpoint khi chưa kiểm docs.
- Endpoint có nhưng thiếu quyền/token thì ghi `api_permission_missing` hoặc `token_scope_missing`.
- Endpoint không tồn tại sau khi kiểm docs chính thức thì ghi `endpoint_not_available`.
- Không fake `actual_income`.
- Không gọi `ship`, `arrange`, `confirm`, `cancel`.
- Không dùng Chrome profile user cho automation.
- Không `taskkill chrome.exe` toàn cục.
- Không xoá legacy nếu chưa audit caller/import/route/test/network.
- Không xoá dữ liệu đơn hàng thật hoặc xoá trắng D1 production.
- Mỗi lượt sửa Warehouse/Core phải cleanup code/data bẩn trong phạm vi; chưa chắc thì đánh dấu deprecated/410 và ghi vào file này.
- Sau mỗi lượt sửa, cập nhật `PROJECT-CURRENT-STATE.md`.

## 8. Cloudflare resources chính thức

- D1 production: `huyvan-analytics-db`.
- Worker API: `huyvan-worker-api`.
- Static/OMS: `shophuyvan-analytics`.
- Chat Worker: `shophuyvan-chat-api`.
- Storage/R2 nếu còn dùng: `huyvan-storage`.

## 9. Cloudflare resources cần xoá lượt này

- D1 tạo nhầm trong account ShopHuyVan analytics: `fbshv_crm_db`.
- Worker tạo nhầm trong account ShopHuyVan analytics: `fbshv-crm`.
- Domain cần biến mất sau xoá: `fbshv-crm.nghiemchihuy.workers.dev`.

## 10. Lỗi đang mở / cần xử lý lượt này

- D1 Rows read quá cao theo Cloudflare usage: `412.37M / 5M`.
- OMS `Failed to fetch` nếu còn phải giữ last-good rows/counts/header, không reset sidebar về `0`.
- `/api/orders` phải tải ổn `limit=50` và `limit=200`, filter status/shop/platform/data_status.
- D1 production cần snapshot schema/tables/indexes/row counts trước khi tối ưu.
- D1 production cần read model/cache/index/cleanup theo Core/Warehouse, không xoá trắng và không xoá dữ liệu đơn hàng thật.
- Code bẩn/worktree bẩn cần phân loại; không revert thay đổi cũ không thuộc lượt này.
- Dữ liệu bẩn trong D1 cần audit/dry-run trước khi cleanup thật.
- Legacy/Python helper thừa cần audit, disable/xoá nếu đủ điều kiện.

## 11. Cập nhật trong lượt hiện tại

- 2026-05-20 lượt cleanup rows-read: đã đọc AGENTS, Skill `shophuyvan-warehouse-core-guard`, docs Core/Warehouse, marketplace endpoint checklist/progress trước khi sửa code.
- Đầu lượt: worktree đã bẩn rộng từ trước; không revert, không xoá theo trạng thái git nếu chưa audit caller/import/route/network/test.
- Đầu lượt: cập nhật luật Worktree/Code Hygiene/Dirty Data và Cloudflare Resource Cleanup vào `AGENTS.md`; cập nhật Skill local/repo để mỗi lượt Warehouse/Core tự kiểm legacy/dirty data.
- `AGENTS.md`: đã cập nhật `Marketplace Open Platform Endpoint Rule`, `Project Current State Rule`, `Automation Browser Safety Rule`.
- Skill `shophuyvan-warehouse-core-guard`: đã cập nhật cả local Codex skill và repo skill với Endpoint First, Project State, Browser Automation Safety, Core/Warehouse Guard.
- File trạng thái: tạo/cập nhật `docs/PROJECT-CURRENT-STATE.md`; không dùng lịch sử chat dài làm nguồn điều phối.
- Endpoint đã kiểm/dùng:
  - Shopee tracking: `/api/v2/logistics/get_tracking_info`, production order `260520UWGXD1S9`, trả 2 event API.
  - Lazada tracking: `/logistic/order/trace`, production order `525472804102182`, API trả rỗng nên drawer ghi reason.
  - Lazada Finance: `/finance/transaction/details/get` là source chuẩn; order chưa có settlement confirmed nên `actual_income` không được fake.
  - Lazada Chat: `/im/session/list`, `/im/message/list`, `/im/message/send` qua bridge; order hiện thiếu `session_id`.
- Deploy:
  - Worker chính `huyvan-worker-api`: `c6e82dcd-53e1-4924-8469-c7fff8692d58`.
  - Chat Worker `shophuyvan-chat-api`: `ee365521-1fd6-4dc0-a267-96c075a3612c`.
  - Static/OMS Worker `shophuyvan-analytics`: bản cuối `af727200-7f3c-4c94-8118-58b5819e9144`.
- Production check:
  - `/api/orders?limit=100/150/200`: pass; limit 200 trả 200 rows, total 10563, không trả `fee_raw_data`.
  - TikTok order `584104642942568017`: popup có `Thực nhận tạm tính 23.950đ`, `Lãi tạm tính 10.242đ`, không gọi là `Thực nhận ví`.
  - Lazada order `525472804102182`: popup có `Thiếu dữ liệu Finance API`, `Thực nhận tạm tính 36.900đ`, `Lãi tạm tính 19.150đ`.
  - Shopee `Nhắn khách` order `260520UWGXD1S9`: mở Chat Worker và gửi `ok` thành công.
  - Lazada `Nhắn khách` order `525472804102182`: mở Chat Worker đúng context; gửi `ok` fail an toàn `missing_session_id`, không fake success.
  - TikTok `Nhắn khách` order `584104642942568017`: không điều hướng gửi tự động, giữ manual/local helper.
  - Responsive tab OMS đang chạy thật: desktop `1366x900`, tablet `820x1180`, mobile `390x844` không tràn ngang, không D1 error, không banner fetch lỗi.
- Auto/Radar:
  - `/api/bot/settings`: `enabled=true`, `auto_order_enabled=true`, `auto_status_enabled=true`, giờ chạy `06:00-20:00`.
  - Shop API có last/next sync: Shopee/Lazada API `ok`, next sync `2026-05-20T08:50:00.000Z` tại thời điểm kiểm.
  - TikTok runner local: `paused`, `profile_login_required=false`, queue pending 4, retry limit 3, cooldown 90s.
- Test:
  - `npm test` Worker chính: pass.
  - `npm run check` Chat Worker: pass.
  - `node --check` các file JS sửa: pass.
  - `git diff --check`: pass, chỉ cảnh báo CRLF.
  - Mojibake scan hẹp: chỉ hit dòng hướng dẫn/ghi chú scan, không có mojibake mới.
  - D1 read-only duplicate: `orders_v2` duplicate group = 0, `order_items` exact duplicate group = 0.
- Legacy audit:
  - Không xoá file legacy/Python/helper trong lượt này.
  - Các nhóm `start_autostart`, `server.py`, `run_report_jobs.py`, task scheduler, local helper route giữ nguyên để audit caller/import/route/network/test trước khi xoá.
- Safety:
  - Không gọi Payment live sync.
  - Không gọi `ship`, `arrange`, `confirm`, `cancel`.
  - Không đổi trạng thái đơn trên sàn.
  - Không dùng Chrome profile user cho automation nền; UI production check dùng đúng profile user `E:\codex-chrome-profiles\shophuyvan-test`.

## 12. Cuối lượt 2026-05-20 - D1 rows-read / cleanup

- Cloudflare cleanup: đã xoá D1 tạo nhầm `fbshv_crm_db` (`fbb7faa5-7dff-4165-ba3c-591adf5334e2`) và Worker tạo nhầm `fbshv-crm` (`fbshv-crm.nghiemchihuy.workers.dev`). List lại xác nhận không còn; không đụng production resources `huyvan-analytics-db`, `huyvan-worker-api`, `shophuyvan-analytics`, `shophuyvan-chat-api`, `huyvan-storage`.
- D1 production vẫn là `huyvan-analytics-db`, UUID `60d0148f-9133-44a8-ad2f-da4d750995f6`. Đã snapshot trước schema change: `.codex-artifacts/d1-backups/huyvan-analytics-db-info-20260520-165834.json`, `.codex-artifacts/d1-backups/huyvan-analytics-db-schema-20260520-165834.sql`, `.codex-artifacts/d1-backups/huyvan-analytics-db-full-20260520-165834.sql`.
- Không xoá trắng DB, không xoá dữ liệu đơn hàng thật. Dirty data mới chạy dry-run: duplicate `orders_v2=0`, duplicate exact `order_items=0`, orphan `order_items/order_fee_details/order_labels=0`; stale Seller Center diagnostics trên shop API còn `20` dòng cần batch riêng.
- Rows-read baseline trước tối ưu theo `d1 info`: `597257938` rows/24h; sau deploy/index/check: `565178972` rows/24h. Đây là rolling usage nên cần theo dõi tiếp sau 24h.
- Đã chạy migration `docs/migrations/009_d1_rows_read_oms_indexes.sql`: thêm index cho `orders_v2`, `order_labels`, `jobs`, `marketplace_webhook_events`, `marketplace_chat_messages`.
- `/api/orders/badges` có TTL cache 30s và header `X-OMS-Cache`; `listMarketplaceShopCapabilities()` có TTL cache 60s khi không đọc secret/fresh; `/api/orders` có header `X-OMS-Query-Ms`, `X-OMS-Query-Count`, `X-OMS-Data-Source`, `X-OMS-Cache`.
- Nguyên nhân rows-read cao: diagnostic/capability lặp lại trên `orders_v2`, label diagnostic, sidebar/badge COUNT theo trạng thái, legacy chat conversation query 7 ngày có correlated subquery trên `marketplace_chat_messages`.
- Legacy/code cleanup: không tạo Skill code hygiene riêng; đã cập nhật Skill `shophuyvan-warehouse-core-guard`. Không xoá file legacy/Python vì chưa đủ caller/import/route/network/test evidence trong worktree đang bẩn rộng. `taskkill chrome.exe` runtime scan không có hit; profile user `E:\codex-chrome-profiles\shophuyvan-test` không có trong runtime `apps/scripts`.
- Production check: Worker main deploy `73838c52-700d-4f1e-adad-43b4ca46e600`; `/api/orders?limit=50`, `/api/orders?limit=200`, `/api/orders/changes?limit=50`, `/api/orders/badges?platform=shopee` pass; filter `PENDING`, `UNPAID`, `SHIPPING`, `COMPLETED`, `CANCELLED`, `RETURN`, `platform`, `shop`, `data_status` pass; list response không có raw payload nặng.
- Browser production bằng Chrome profile `E:\codex-chrome-profiles\shophuyvan-test`: desktop `1366x900`, tablet `820x1180`, mobile `390x844` pass, không tràn ngang, không `Failed to fetch`, bảng có đơn, sidebar không reset 0. Popup phí và tracking drawer mở được read-only.
- Cleanup cần làm lượt sau: theo dõi D1 usage sau 24h rolling; cleanup stale diagnostic 20 dòng bằng batch nhỏ nếu user chốt; audit/chặn sâu hơn OMS Shopee ops/API phase 2 dry-run nếu còn route public không cần; audit Python/local helper theo lock/status/scheduler trước khi xoá.

## 13. Cuối lượt 2026-05-20 - OMS Chat/Data/Scanner/TikTok stabilization

- Cloudflare cleanup `fbshv_crm_db` và `fbshv-crm` không chạy lại trong lượt này theo cập nhật của user. Không đụng lại D1/Worker đã xoá và không đụng các resource production ngoài deploy đúng `huyvan-worker-api` / `shophuyvan-analytics`.
- Deploy cuối lượt:
  - Worker chính `huyvan-worker-api`: `8bee9805-310c-4112-aca3-edb233c7a0e2`.
  - Static/OMS `shophuyvan-analytics`: `3dbcf7a5-b912-45c0-845d-a21959fa96fd`.
  - Chat Worker không đổi code trong lượt này; đã kiểm `npm run check` pass.
- D1 production `huyvan-analytics-db` cleanup scoped:
  - Dry-run trước cleanup: `order_items` có `10` dòng `Mã yêu cầu trả hàng`, `10` dòng `Thiếu chi tiết sản phẩm`, `58` sản phẩm/SKU `SP_`.
  - Tạo backup `cleanup_order_items_dirty_placeholder_backup_20260520` với `20` dòng placeholder trước khi xoá.
  - Xoá thật đúng `20` dòng `order_items` giả/placeholder; không xoá `orders_v2`, không xoá dữ liệu thanh toán, không xoá return/refund record thật.
  - Tạo `order_return_refund_markers` và insert `10` marker để OMS vẫn biết đơn có yêu cầu trả/hoàn sau khi bỏ item giả.
  - `products` thêm guard `hidden_from_mapping`, `sku_type`, `user_confirmed`; soft-hide `58` dòng `SP_` bằng `hidden_from_mapping=1`, `sku_type=placeholder`.
- Core guard đã sửa:
  - Parser/read model không ghi `Mã yêu cầu trả hàng` và `Thiếu chi tiết sản phẩm` như product item.
  - `/api/orders` trả `item_data_status`, `item_missing_reason`, `return_refund_marker`, `dirty_item_markers`.
  - Finance Core loại đơn hủy khỏi lãi/doanh thu thực bằng `canceled_excluded`; đơn hoàn/trả chưa quyết toán là `return_pending`, không hiện lãi xanh.
  - TikTok estimate dùng cùng Finance Core; khi có fee rows thì `estimated_income = gross - fees`, không để net bằng gross.
- Production API check:
  - `/api/orders?limit=50`: HTTP 200, `50` rows, total `10569`, request id `orders-1779278478340-0r34lc`, không có raw payload nặng trong row.
  - `/api/orders?limit=200`: HTTP 200, `200` rows, total `10569`, request id `orders-1779278479465-arkzfq`, không có `fee_raw_data`, `raw_order_json`, `raw_fee_payload`.
  - Filter `Tất cả`, `Chờ xử lý`, `Chưa xử lý`, `Đang giao`, `Đã giao`, `Đã hủy`, `Hoàn hàng` pass HTTP 200.
  - Ví dụ `260502CNB5D0BT`, `26042946J2RFU4`, `260421DJ4DD7UH` không còn trả `Mã yêu cầu trả hàng` như sản phẩm; marker hoàn/trả vẫn giữ.
  - Ví dụ `251228HGNEETPT`, `251227FSR61SEH`, `251227F6AN3G10` không còn trả placeholder `Thiếu chi tiết sản phẩm`; trạng thái là `item_missing`.
  - Ví dụ hủy/hoàn: `251126PUSYHQN2` về `canceled_excluded`, profit `0`; `251121C57JUH9N` về `return_pending`, không còn lãi xanh. `251011SOHV1C20` không tìm thấy qua API search trong lượt này.
  - TikTok `584104642942568017`: gross `35.000`, fee `11.050`, `estimated_income=23.950`, đúng công thức tạm tính.
  - `/api/products?search=SP_` trả `0`; `/api/products?search=SP_&include_temp=1` trả `58` mã tạm đã hidden.
- Chat từ OMS/order:
  - Core route chat target nhẹ không scan toàn bộ `orders_v2`, trả `platform`, `shop_id/shop_key`, `order_id`, buyer/conversation target, `source`, `confidence`, `missing_fields`.
  - Worker chính `/api/chat/context` và `/api/chat/conversations` vẫn trả `410`; OMS không dùng legacy chat scan D1.
  - Shopee `chihuy1984`, order `260520VCWW63EE`: gửi `ok` pass qua Chat Worker, message `msg_c994adeb-d53e-4270-abec-a9700556d5a5`, Shopee message `2414388038268797297`.
  - Shopee `chihuy2309`, order `260520VDAFN735`: gửi `ok` pass qua Chat Worker, message `msg_11199a2e-e15c-47c4-a826-a0bc77e20ddd`, Shopee message `2414388042335093105`.
  - Shopee `phambich2312`, order `260520UVFANRBD`: gửi `ok` pass qua Chat Worker, message `msg_180031fe-ed44-4f96-8408-4525d4e14887`, Shopee message `2414388045514441075`.
  - Lazada `kinhdoanhonlinegiasoc@gmail.com`, order `525472804102182`: gửi `ok` fail an toàn `missing_session_id`, message nội bộ `msg_132a0025-f6f9-4309-bf51-06de9e5061c9`; sync `/im/session/list` và `/im/message/list` pulled `0`, chưa có session chính thức khớp đơn.
  - TikTok `0909128999`, order `584104642942568017`: gửi `ok` fail/classified `manual_send_required`, status `manual_pending`, message nội bộ `msg_74c624e5-669b-4167-b267-5985a0206c12`; chưa có live bridge/API chính thức nên không fake success.
- Scanner:
  - Thêm phone scanner bridge API: `POST /api/scan-bridge/session`, `GET /api/scan-bridge/session/:id`, `POST /connect`, `POST /result`.
  - Trang `pages/scan-qr.html` tạo QR pairing trên PC, mobile mode mở camera bằng `navigator.mediaDevices.getUserMedia`, có nhập tay và lỗi rõ.
  - API session test pass: tạo session, connect phone, post result code `260520VCWW63EE`, PC/session nhận `found=true`, `order_id=260520VCWW63EE`.
  - Production QR desktop render bằng vendor self-host `apps/fe/js/vendor/qrcode.min.js`; canvas có pixel tối, không còn bị CDN/ORB chặn.
  - Mobile viewport 390x844 trả lỗi thật `camera_not_found` trên máy test desktop khi xin quyền camera; không trắng màn hình. Chưa xác nhận bằng camera điện thoại vật lý trong lượt này.
- TikTok auto:
  - Clear pause cache cũ ở `E:\shophuyvan-runtime\runner-control\tiktok\pause.json` / `status.json`; không còn `codex_hotfix_final_pause`.
  - `tiktok_runner_control.py` tự clear legacy pause reason và ghi `resume_reason=legacy_pause_cleared`.
  - Radar không còn hard-code skip TikTok vì `tiktok_auto_background_disabled_manual_one_shot_only`; khi không paused thì queue batch nhỏ an toàn qua manual-sync/backfill.
  - Đã restart đúng Radar PID từ status/commandline, không `taskkill chrome.exe`, không đóng Chrome user.
  - Status sau clear: `paused=false`, `pause_reason=""`, profile automation `E:\shophuyvan-python-automation\profiles\browser\shophuyvan-runner-tiktok`, queue pending `4`.
  - Sau wake/restart scheduler: TikTok `0909128999` nằm trong `ran_shops`, `skipped=[]`, `queued=0`, `eligible=0`, `next_order_run_at=2026-05-20T19:49:09+07:00`.
- Production browser check bằng Chrome profile `E:\codex-chrome-profiles\shophuyvan-test`:
  - URL `https://shophuyvan-analytics.nghiemchihuy.workers.dev/pages/oms-dashboard`.
  - Desktop `1366x900`, tablet `820x1180`, mobile `390x844`: không `Failed to fetch`, sidebar không reset `0`, có đơn, không tràn ngang.
  - Từ OMS bấm thật `Nhắn khách` ở order `260520VDAFN735`, mở `chat-cskh` đúng context và thấy tin `ok` trạng thái `Đã gửi`.
  - Scanner desktop QR pass; mobile scanner có UI và lỗi camera rõ như trên.
- Test cuối:
  - `npm test` Worker chính pass.
  - `npm run check` Chat Worker pass.
  - Inline scanner script syntax check pass.
  - `python -m py_compile` cho `tiktok_runner_control.py` và `oms_radar_tab.py` pass.
  - `git diff --check` pass trên phạm vi touched files.
- Lỗi còn mở:
  - Lazada cần mapping chính thức order/customer -> `session_id` hoặc endpoint/permission bổ sung; hiện classified `missing_session_id`, không pass live send.
  - TikTok chat live vẫn `manual_send_required`; cần bridge/API chính thức hoặc automation gửi tay đã login trước khi coi là pass live send.
  - Camera điện thoại vật lý chưa được test trong lượt này; desktop Chrome mobile viewport chỉ xác nhận UI và lỗi `camera_not_found`.
  - Order `251011SOHV1C20` không tìm thấy qua API search nên chưa xác nhận riêng được.

## 14. Cuối lượt 2026-05-20 - Stabilization follow-up Chat/Runner/Tracking

- Không chạy lại Cloudflare cleanup `fbshv_crm_db` / `fbshv-crm`; lượt này chỉ deploy đúng resources production đang dùng.
- Deploy cuối lượt:
  - Worker chính `huyvan-worker-api`: `84c4db06-fb0f-4f39-a426-e2fb8a788cc2`.
  - Chat Worker `shophuyvan-chat-api`: `3b54a3d9-ddaf-42b9-b190-972272e442c7`.
  - Static/OMS `shophuyvan-analytics`: `714dbf57-8b6e-4180-b279-2b2cca3ba941`.
- Lazada OMS chat đã đổi sang nguồn Đồng bộ thật trong `marketplace_chat_conversations`. Order `527394116390561` map session/conversation `200013190561_1_200166591213_2_103`, source `marketplace_chat_conversations:api:order_message_card`, confidence `order_session_confirmed`.
- Live send Lazada từ OMS/Chat UI PASS với text `ok`: Chat Worker message `msg_81ec3ec8-f027-46c9-85af-e6de46d3849e`, Lazada platform message `9fbd4NrxXBS0BPAmD68895`.
- Shopee regression PASS cả 3 shop API với text `ok`:
  - `chihuy1984` order `260520VCWW63EE`, Chat Worker message `msg_10f84310-0244-41a9-8432-5e8487398c40`, Shopee message `2414401834649469297`.
  - `chihuy2309` order `260520VDAFN735`, Chat Worker message `msg_fdbd535e-6550-4869-bd16-5fd15b17d754`, Shopee message `2414401836182552946`.
  - `phambich2312` order `260520UVFANRBD`, Chat Worker message `msg_bd4758bd-73c5-45bc-aa05-6cadce05a31d`, Shopee message `2414401837572981105`.
- TikTok chat order `584104642942568017` chưa PASS live. Official Customer Service API family có send/get conversations, nhưng project hiện chưa có TikTok Chat adapter/token scope cấu hình; production trả `adapter_not_configured` / manual path, không fake success.
- Auto runner đã có execution thật, không dừng ở queued:
  - TikTok job `1102` order `584104642942568017`: queued -> running -> failed `runner_requires_login`, profile `E:\shophuyvan-python-automation\profiles\browser\shophuyvan-runner-tiktok`.
  - Shopee no-API job `1103` order `260518QQ5KH2CM`: queued -> running -> completed, profile `E:\shophuyvan-python-automation\profiles\browser\HuyVan_Bot_Data_khogiadungcona`, 0 update vì order thiếu `seller_center_detail_url`.
  - `codex_hotfix_final_pause` không còn trong runtime; `pause_reason` hiện là `one_shot_batch_completed`.
- Tracking Core/OMS read model:
  - Shopee order `260520UWGXD1S9`, tracking `SPXVN067286379715`, source `shopee_open_platform:/api/v2/logistics/get_tracking_info`, 4 events, latest `PICKED_UP`; OMS row không còn lấy lỗi batch cũ làm status chính khi API timeline hợp lệ.
  - Shopee API shop samples pass: `chihuy1984` order `260520VHRTBRUE` 1 event `ORDER_CREATED`; `chihuy2309` order `260520VGB2GKB8` 4 events `PICKED_UP`; `phambich2312` order `260520VJFSN5BF` 1 event `ORDER_CREATED`.
  - Lazada `/logistic/order/trace` trả tracking number nhưng chưa có timeline event cho các order đã kiểm; OMS giữ trạng thái đơn/tracking number, timeline full là `empty` chứ không báo thiếu endpoint.
- TikTok order `584104642942568017` trả `seller_center_detail_required`; cần runner/login để lấy timeline, không fake event.
- Backend `/api/operations/shopee/action` đã khóa cứng write actions như `ship_order`/`mass_ship_order` dù có `execute=true`; production trả `write_action_disabled`, `sent_to_shopee=false`. Frontend dry-run panel cũng chuyển response lỗi thành toast lỗi, không báo OK giả.
- Dirty data regression:
  - `Mã yêu cầu trả hàng` và `Thiếu chi tiết sản phẩm` không còn trong `order_items` dry-run.
  - `/api/products?search=SP_` mặc định trả 0; `include_temp=1` mới thấy placeholder đã soft-hide.
  - Return/refund order qua API read model hiển thị `return_pending` / `Chờ hoàn/trả`, không còn lãi xanh dù raw analytics còn row lịch sử.
- Production Chrome profile `E:\codex-chrome-profiles\shophuyvan-test` đã kiểm OMS thật: desktop/tablet/mobile không `Failed to fetch`, không tràn ngang, badge sidebar sau hard reload cuối giữ số thật (`ALL=10576`, `PENDING=16`) nhờ cache trước khi badge API trả về.
- Còn mở: scanner điện thoại vật lý chưa kiểm được trong môi trường này; chỉ có bridge/session và UI camera fallback đã kiểm ở lượt trước.

## 15. Cuối lượt 2026-05-20 - Runner browser lifecycle Shopee/TikTok

- Root blocker đã sửa: job Shopee/TikTok không còn được coi là chạy xong nếu chưa qua lifecycle browser. Runner ghi `runner_picked`, `browser_launch_requested`, `browser_launched`, `login_checking`, `runner_started`, `runner_finished` trong `log_text.lifecycle_events`; nếu Chrome không mở được thì status phải `failed` với `browser_launch_failed` / `runner_environment_error`.
- Worker chính deploy `5821e5df-edb2-4820-9459-ab010637f6f8`. Static/OMS không đổi code trong lượt này. Local helper/Radar đã restart đúng PID Python, helper PID `27436`, Radar PID `25484`, session Windows `1`, `interactive_desktop=true`.
- Profile automation:
  - TikTok: `E:\shophuyvan-python-automation\profiles\browser\shophuyvan-runner-tiktok`.
  - Shopee no-API `khogiadungcona`: `E:\shophuyvan-python-automation\profiles\browser\HuyVan_Bot_Data_khogiadungcona`.
  - Không dùng profile user `E:\codex-chrome-profiles\shophuyvan-test` cho runner; profile user chỉ dùng thao tác UI Web.
- Manual browser launch test headful:
  - TikTok mở `https://seller-vn.tiktok.com/account/login`, Chrome PID `11996`, CDP `ws://127.0.0.1:9331/devtools/browser/bec15ac4-c36c-4ccd-bd1d-e68e2e30bb0e`, session `1`.
  - Shopee mở `https://banhang.shopee.vn/`, Chrome PID `4132`, CDP `ws://127.0.0.1:9332/devtools/browser/4203be6b-c459-4bec-ad65-2c788fe8650f`, session `1`.
- E2E Web/Radar:
  - Bấm thật nút OMS `Kéo đơn mới tốc độ cao`: job Web `1106`, tạo runner jobs TikTok `1107` và Shopee `1108`; cả hai completed thật với `headless=false`, `login_state=logged_in`, browser PID/CDP rõ.
  - Chạy lại Web-style job `1109` sau khi bổ sung lifecycle history: TikTok job `1110`, Shopee job `1111`, cả hai completed và final `log_text` chứa đủ `lifecycle_events`.
- Kết quả TikTok `0909128999`:
  - `job_id=1110`, `run_id=tiktok-1110-1779289512`, queue path `https://huyvan-worker-api.nghiemchihuy.workers.dev/api/jobs`.
  - Launcher: `E:\shophuyvan-python-automation\oms_python\features\reports\run_report_jobs.py`, function `run_job_for_shop()`.
  - Chrome executable `C:\Program Files\Google\Chrome\Application\chrome.exe`, profile `E:\shophuyvan-python-automation\profiles\browser\shophuyvan-runner-tiktok`, `headless=false`, `browser_pid=11996`, CDP như trên.
  - First URL cuối: `https://seller-vn.tiktok.com/order/detail?order_no=584104642942568017&shop_region=VN`; login `logged_in`; final `completed`; scanned/updated: backfill ghi Warehouse `1` đơn, skipped/error `0`.
- Kết quả Shopee no-API `khogiadungcona`:
  - `job_id=1111`, `run_id=shopee-1111-1779289551`, queue path `https://huyvan-worker-api.nghiemchihuy.workers.dev/api/jobs`.
  - Launcher: `E:\shophuyvan-python-automation\oms_python\features\reports\run_report_jobs.py`, function `run_job_for_shop()`.
  - Chrome executable `C:\Program Files\Google\Chrome\Application\chrome.exe`, profile `E:\shophuyvan-python-automation\profiles\browser\HuyVan_Bot_Data_khogiadungcona`, `headless=false`, `browser_pid=4132`, CDP như trên.
  - First URL cuối: `https://banhang.shopee.vn/portal/sale/order`; login `logged_in`; final `completed`; scanned/updated: Seller Center detail chạy thật, ghi Warehouse `0` đơn vì `seller_center_detail_url_not_found`, không completed giả trước khi browser chạy.
- Runtime safety:
  - `one_shot_batch_completed` chỉ còn là state/history sau batch, không tạo `pause.json` chặn lần chạy mới.
  - Không dùng `taskkill chrome.exe`, không kill Chrome theo name chung, không đóng Chrome user. Chỉ restart đúng PID Python helper/Radar.
  - `tiktok_runner.profile_login_required=false`, `paused=false`, `pause_reason=""` sau run; browser automation vẫn mở trong desktop session hiện tại.

## 16. Cuối lượt 2026-05-20 - Runner action/debug instrumentation

- Không viết lại runner/action/parser. Lượt này chỉ nối lại bằng chứng từ runner hiện có: `run_report_jobs.py::run_task()` trả về result của action, `run_job_for_shop()` forward `before_action/after_action`, page diagnostics, parser/update events và không coi `partial_error` là completed.
- Điểm đứt đã xác định: trước đây `run_task()` gọi action xong nhưng không return result; `run_job_for_shop()` luôn patch `completed`, nên browser mở nhưng người vận hành không thấy action/parser/update đang đứng ở đâu.
- Instrumentation bổ sung quanh action hiện có:
  - TikTok: `TikTokEngine.tiktok_backfill_seller_finance_detail` -> `backfill_seller_detail_finance_for_orders` -> `parse_seller_detail_page`.
  - Shopee: `ShopeeEngine.shopee_backfill_seller_detail` -> `backfill_shopee_seller_detail_for_orders` -> `parse_seller_detail_page` / `resolve_detail_url_by_search`.
- Web/Radar test cuối: Web job `1121` chạy thật, kết quả `partial_error` vì Shopee lỗi thật; không báo success giả.
- TikTok `0909128999`: job `1122`, run `tiktok-1122-1779291397`, profile `E:\shophuyvan-python-automation\profiles\browser\shophuyvan-runner-tiktok`, Chrome PID `11996`, headless `false`, first URL `https://seller-vn.tiktok.com/order/detail?order_no=584104642942568017&shop_region=VN`, action completed, parsed `1`, updated `1`, errors `0`.
- Shopee `khogiadungcona`: job `1123`, run `shopee-1123-1779291447`, profile `E:\shophuyvan-python-automation\profiles\browser\HuyVan_Bot_Data_khogiadungcona`, Chrome PID `4132`, headless `false`, first URL `https://banhang.shopee.vn/portal/sale/order`, action vào đúng existing function nhưng failed thật: `seller_center_detail_url_not_found`, selector order row `260519RW5S0TA2` timeout tại list page; screenshot `E:\shophuyvan-runtime\debug-payloads\runner-screenshots\20260520-223820-shopee-260519RW5S0TA2-order_row_not_found.png`.
- Rerun Shopee đơn lẻ sau chỉnh event: job `1124`, run `shopee-1124-1779291744`, final `failed`, lifecycle có `action_failed_no_change` thay vì `completed_no_change`; screenshot mới `E:\shophuyvan-runtime\debug-payloads\runner-screenshots\20260520-224322-shopee-260519RW5S0TA2-order_row_not_found.png`.
- Safety: không dùng profile user, không `taskkill chrome.exe`, không đóng Chrome user; chỉ đọc/điều khiển profile automation riêng.

## 17. Cuối lượt 2026-05-20 - OMS pull/status real acceptance

- Phạm vi nghiệm thu: bấm thật 2 nút riêng trên OMS production cho TikTok `0909128999` và Shopee no-API `khogiadungcona`: `Kéo đơn` (`action_type=pull_orders`) và `Cập nhật trạng thái` (`action_type=refresh_status`).
- Worker chính `huyvan-worker-api` deploy sau hotfix mapping Shopee Seller Center status: `32e577e7-e3f2-45b4-9177-d790c44ab3be`, account `efe50fab1dd644088d681fb14a4838ae`.
- Test/code check: `node --check apps/worker-api/src/core/orders/status-core.js`, `node scripts/test-order-core-guard.mjs`, `node scripts/test-shopee-seller-detail-core.mjs`, và `npm test` trong `apps/worker-api` đều pass.
- TikTok `Kéo đơn` PASS: job `1127`, run `tiktok-1127-1779295051`, `action_type=pull_orders`, scanned `72`, updated `72`, `parsed_status=true`, `parsed_tracking=true`, `parsed_items=true`, `api_request_id=import-orders-v2-1779295110232-e6brak`; readback có order `584118922740139598` tracking `TTVN1080793108`, item `ok`, và order `584116279132914802` status `SHIPPING/SHIPPED`, tracking `861703563917`.
- Shopee `Kéo đơn` PASS: job `1129`, run `shopee-1129-1779295467`, `action_type=pull_orders`, scanned `53`, updated `53`, `parsed_status=true`, `parsed_tracking=true`, `parsed_items=true`, `api_request_id=import-orders-v2-1779295517483-p7v9a3`; readback có order `260519RW5S0TA2` tracking `SPXVN067508201855`, carrier `SPX Express`, item `ok`.
- TikTok `Cập nhật trạng thái` PASS: job `1135`, run `tiktok-1135-1779298670`, `action_type=refresh_status`, eligible `5`, parsed `5`, updated `5`, `parsed_status=true`, `parsed_tracking=true`, `parsed_items=true`, `api_request_id=tiktok-seller-detail-1779298884439-p68se1`; parser dùng finance transactions `orderOrSkuId`, bấm row-scoped `Xem chi tiết`, bấm `Thông tin kho vận`, mở customer reveal theo ảnh user chỉ; readback sau có `last_status_sync_error=""`, item `ok`, detail source `finance_transactions_xem_chi_tiet`.
- Shopee `Cập nhật trạng thái` PASS: job `1139`, run `shopee-1139-1779300337`, `action_type=refresh_status`, trigger `oms_refresh_status_panel`, profile automation `E:\shophuyvan-python-automation\profiles\browser\HuyVan_Bot_Data_khogiadungcona`, eligible `4`, parsed `4`, updated `4`, error `0`, `parsed_status=true`, `parsed_tracking=true`, `parsed_items=true`, `api_request_id=shopee-seller-detail-1779300515618-lbeklp`.
- Shopee readback trước job `1139`: các order `260520VPM23704`, `260519RW5S0TA2`, `260518QQ5KH2CM`, `260518PX5DB9MA` còn `last_status_sync_error=unknown_status`; completed orders vẫn bị storage `oms_status=PENDING` dù read model hiểu completed.
- Shopee readback sau job `1139`: `260520VPM23704` -> `PENDING/LOGISTICS_REQUEST_CREATED`, carrier `SPX Express`, tracking trống đúng trạng thái chờ lấy, item `ok`, error trống; `260519RW5S0TA2` -> `COMPLETED/COMPLETED`, tracking `SPXVN067508201855`, items `2`, error trống; `260518QQ5KH2CM` -> `COMPLETED/COMPLETED`, tracking `VN261240371119W`, carrier `SPX Instant`, item `ok`, error trống; `260518PX5DB9MA` -> `COMPLETED/COMPLETED`, tracking `VN2692040012780`, carrier `SPX Instant`, item line qty `2`, error trống.
- Shopee detail URL source: job `1139` dùng verified `seller_center_detail_url` trong OMS cho cả 4 đơn; log có `detail_url_resolved` cho `260518PX5DB9MA` từ `new_tab_or_current_page`, các URL readback lần lượt `232986368285700`, `232855966247234`, `232815158299028`, `232788308272778`.
- Lỗi đã sửa đúng điểm đứt: `seller_center_detail_url_not_found` đã hết ở test cuối; `readback_mismatch/unknown_status` đã hết sau mapping `ĐÃ GIAO` và `CHỜ LẤY HÀNG` sang Core status chuẩn.
- Safety: không gọi Payment live sync, không gọi ship/arrange/confirm/cancel/hủy/giao hàng, không dùng Chrome profile user cho runner, không `taskkill chrome.exe`.

## 18. Cuối lượt 2026-05-21 - Chuẩn hóa Python automation theo action Core/Warehouse

### File production mới

| Platform | Kéo đơn mới | Cập nhật trạng thái | Đồng bộ chi tiết | Cập nhật tài chính | Tải lại tem | Kiểm tra |
| --- | --- | --- | --- | --- | --- | --- |
| TikTok `0909128999` | `platforms/tiktok/orders/keodonmoi.py` | `platforms/tiktok/orders/capnhattrangthai.py` | `platforms/tiktok/orders/dongbochitiet.py` | `platforms/tiktok/orders/capnhattaichinh.py` | `platforms/tiktok/orders/taitem.py` | `kiemtra.py`, `kiemtrareadonly.py` diagnostic-only |
| Shopee no-API `khogiadungcona` | `platforms/shopee/orders/keodonmoi.py` | `platforms/shopee/orders/capnhattrangthai.py` | `platforms/shopee/orders/dongbochitiet.py` | `platforms/shopee/orders/capnhattaichinh.py` | `platforms/shopee/orders/taitem.py` | chưa cần file diagnostic production riêng |

### File cũ đã xử lý

| File cũ | Xử lý | Ghi chú |
| --- | --- | --- |
| `tiktok_orders.py` | đổi thành `danhsach_donhang.py` | module danh sách nội bộ; nút `pull_orders/status` đi qua `keodonmoi.py`/`capnhattrangthai.py` |
| `tiktok_order_parser.py` | đổi thành `parser_donhang.py` | parser core danh sách đơn |
| `seller_detail_backfill.py` TikTok | đổi thành `dongbochitiet.py` | `capnhattaichinh.py` chỉ gọi finance scope, không fake actual income |
| `seller_detail_parser.py` TikTok | đổi thành `parser_chitiet.py` | parser detail chung cho detail/finance |
| `tiktok_process.py` | đổi thành `taitem.py` | chỉ tải lại tem, bỏ qua đơn cần sắp xếp vận chuyển |
| `readonly_check.py`, `status_dryrun.py` | đổi thành `kiemtrareadonly.py`, `kiemtra.py` | diagnostic-only |
| `shopee_orders.py` | đổi thành `danhsach_donhang.py` | API shop bị chặn Chrome, no-API mới dùng browser |
| `shopee_orders_browser.py` | đổi thành `browser_donhang.py` | browser no-API |
| `shopee_order_parser.py` | đổi thành `parser_donhang.py` | parser core danh sách đơn |
| `seller_detail_backfill.py` Shopee | đổi thành `dongbochitiet.py` | chỉ dùng cho `khogiadungcona` |
| `seller_detail_parser.py` Shopee | đổi thành `parser_chitiet.py` | parser detail |
| `shopee_process.py` | đổi thành `taitem.py` | không gọi prepare/ship, chỉ retry label |
| `shopee_orders_api.py` | xoá | không còn caller; shop API đi Worker/Open Platform |
| `tiktok_don_hang.py`, `shopee_don_hang.py` | giữ | chỉ historical Excel theo ngày/tháng, không dùng nút kéo đơn nhanh |

### Profile automation

| Platform | Shop | Profile path | automation_allowed | Login status kiểm 2026-05-21 | last_verified_at |
| --- | --- | --- | --- | --- | --- |
| TikTok | `0909128999` | `E:\shophuyvan-python-automation\profiles\browser\shophuyvan-runner-tiktok` | true | `runner_requires_login`, đang ở trang login TikTok Seller | `2026-05-21T11:41:24+07:00` |
| Shopee | `khogiadungcona` | `E:\shophuyvan-python-automation\profiles\browser\HuyVan_Bot_Data_khogiadungcona` | true | `runner_requires_login`, đang ở trang login Shopee Seller | `2026-05-21T11:41:24+07:00` |
| Shopee API | `chihuy1984`, `chihuy2309`, `phambich2312` | none for Chrome automation | false | `api_shop_no_chrome` | `2026-05-21` |
| Lazada API | `kinhdoanhonlinegiasoc@gmail.com` | none for Chrome automation | false | `api_shop_no_chrome` | `2026-05-21` |

Profile audit evidence: `E:\shophuyvan-runtime\debug-payloads\profile-audit\profile-cdp-audit-20260521-114124.json`, screenshots `tiktok-0909128999-20260521-114121.png` và `shopee-khogiadungcona-20260521-114123.png`.

### Profile rename / UNMAPPED

Không rename profile trong lượt này vì `HuyVan_Bot_Data_Shop1`, `HuyVan_Bot_Data_Shop2`, `HuyVan_Bot_Data_Shop3` chỉ mở được trang login Shopee, chưa có bằng chứng shop name/username/phone/email. Ba profile này giữ `UNMAPPED`, `automation_allowed=false`, không dùng automation.

### Trung tâm tự động

| Tính năng | action_type | Route/UI | Runner file | Schedule/batch hiện tại | Last/next/error |
| --- | --- | --- | --- | --- | --- |
| Tự kéo đơn mới | `pull_orders` | `/api/orders/manual-sync/backfill`, OMS panel | `keodonmoi.py` | batch TikTok tối đa 10, Shopee no-API tối đa 20 | chưa pass e2e do profile cần login |
| Tự cập nhật trạng thái | `refresh_status` | `/api/orders/manual-sync/backfill`, OMS panel | `capnhattrangthai.py` | batch nhỏ, có profile/action/order lock | chưa pass e2e do profile cần login |
| Tự đồng bộ chi tiết | `sync_detail` | `/api/orders/manual-sync/backfill`, OMS panel | `dongbochitiet.py` | batch tối đa 20 | chưa pass e2e do profile cần login |
| Tự cập nhật tài chính | `sync_finance` | `/api/orders/manual-sync/backfill`, OMS panel | `capnhattaichinh.py` | batch tối đa 20, pending settlement không nâng estimate thành actual | chưa pass e2e do profile cần login |
| Tự tải lại tem lỗi | `retry_label` | `/api/label/retry-failed`, `/api/orders/manual-sync/backfill` explicit order ids | `taitem.py` | API shop dùng Worker label document; no-API/TikTok queue local runner | chưa pass e2e no-API do profile cần login |

### Runner/action routing

- `pull_orders` / `keodonmoi`: TikTok -> `platforms/tiktok/orders/keodonmoi.py`; Shopee no-API -> `platforms/shopee/orders/keodonmoi.py`; shop API -> Worker/Open Platform.
- `refresh_status` / `capnhattrangthai`: TikTok -> `capnhattrangthai.py`; Shopee no-API -> `capnhattrangthai.py`; shop API -> Worker/Open Platform.
- `sync_detail` / `dongbochitiet`: TikTok -> `dongbochitiet.py`; Shopee no-API -> `dongbochitiet.py`; shop API không Seller Center fallback.
- `sync_finance` / `capnhattaichinh`: TikTok -> `capnhattaichinh.py`; Shopee no-API -> `capnhattaichinh.py`; shop API -> Open Platform/Worker API.
- `retry_label` / `taitem`: TikTok -> `taitem.py`; Shopee no-API -> `taitem.py`; Shopee/Lazada API -> Worker/Open Platform label route nếu capability đủ.

### Test và blocker thật

- `python -m py_compile` các file Python sửa: pass.
- Parser tests: `test_tiktok_seller_detail_parser.py`, `test_shopee_seller_detail_parser.py` pass.
- Worker `npm test`: pass.
- Guard tests liên quan runner/label/source/finance/order/scheduler: pass.
- Browser/profile audit thật: pass ở mức mở Chrome đúng profile cố định, nhưng cả TikTok và Shopee no-API đang ở login page nên các test kéo đơn/trạng thái/detail/finance/tải tem không được báo PASS e2e.
- `taitem.py` đã dọn tên hàm nội bộ sang `process_label_retry_orders` / `_accept_print_dialog`; không click nút `Hủy/Cancel` để đóng popup, chỉ dùng `Escape`, và chỉ phát hiện nút `Sắp xếp vận chuyển` để bỏ qua.
- Không có `taskkill chrome.exe` trong scope automation sửa; không dùng `E:\codex-chrome-profiles\shophuyvan-test` cho automation runtime; không gọi Payment live; không gọi ship/arrange/confirm/cancel.
- Production UI đã mở bằng profile user `E:\codex-chrome-profiles\shophuyvan-test`; modal OMS production hiện vẫn chỉ expose `pull_orders`/`refresh_status`, chưa thấy nút `sync_detail`/`sync_finance` vì static frontend chưa deploy trong lượt này. Không deploy do workspace có nhiều thay đổi ngoài phạm vi automation, tránh đẩy nhầm dirty worktree.
- `AGENTS.md` đã rút khối automation checklist dài khỏi cuối file; luật chi tiết nằm trong Skill `shophuyvan-automation-guard` và docs để không mâu thuẫn với rule không nhồi AGENTS.

## 19. Cập nhật 2026-05-21 - Profile map chung và audit Chrome hiện tại

Mục này supersede phần profile/login ở mục 18 nếu có mâu thuẫn. Lượt này đọc lại `AGENTS.md`, Skill `shophuyvan-warehouse-core-guard`, Skill `shophuyvan-automation-guard`, `PROJECT-CURRENT-STATE`, `warehouse-core-map`, `core-data-map`, `shop-order-product-core-plan`, `chat-refactor-map`, `marketplace-endpoint-master-checklist` và `marketplace-endpoint-progress` trước khi sửa.

- Evidence audit mới: `E:\shophuyvan-runtime\debug-payloads\profile-audit-20260521T053551\profile-audit.json`; screenshot nằm cùng thư mục. URL có query nhạy cảm đã được redact trong JSON.
- Đã tạo profile Lazada đúng thư mục chuẩn: `E:\shophuyvan-python-automation\profiles\browser\HuyVan_Bot_Data_lazada_kinhdoanhonlinegiasoc`. Profile đang ở trang Lazada Seller Center Sign Up/Login, `automation_allowed=false`; chỉ dùng user đăng nhập/kiểm thủ công, production Lazada vẫn dùng Open Platform/Worker API.
- `oms_python/core/automation_profiles.py` đã có profile map chung với đủ `platform`, `shop_key`, `shop_name`, `automation_allowed`, `chrome_profile_path`, `profile_status`, `last_verified_at`, `source`, `reason`.
- `E:\shophuyvan-python-automation\data\shops.json` đã đổi Lazada từ profile cũ `HuyVan_Bot_Data_Lazada` sang `HuyVan_Bot_Data_lazada_kinhdoanhonlinegiasoc`.
- TikTok `0909128999`: profile `shophuyvan-runner-tiktok`, CDP `9331`, đang vào Seller Center profile, login/session hợp lệ tại thời điểm audit; `source=local_browser`, `automation_allowed=true`.
- Shopee no-API `khogiadungcona`: profile `HuyVan_Bot_Data_khogiadungcona`, CDP `9332`, đang vào Seller Center, login/session hợp lệ tại thời điểm audit; `source=local_browser`, `automation_allowed=true`.
- Shopee API `phambich2312`: profile cũ `HuyVan_Bot_Data_Shop1` được audit thấy Seller Center có username `phambich2312`; vì Chrome profile đang mở nên chưa rename folder, `automation_allowed=false`, `source=api`.
- Shopee API `chihuy2309`: profile cũ `HuyVan_Bot_Data_Shop2` được audit thấy Seller Center có username `chihuy2309`; vì Chrome profile đang mở nên chưa rename folder, `automation_allowed=false`, `source=api`.
- Shopee API `chihuy1984`: profile cũ `HuyVan_Bot_Data_Shop3` hiện về trang Shopee login; evidence trước đó chỉ thấy account masked `c***984`, nên trạng thái là `probable_chihuy1984_requires_login`, chưa rename và không dùng automation.
- Không rename bất kỳ profile nào trong lượt này vì các profile Shop1/Shop2/Shop3 đang có Chrome process giữ profile. Không đóng Chrome toàn cục, không `taskkill chrome.exe`.
- Runner/action routing hiện tại: `pull_orders -> keodonmoi.py`, `refresh_status -> capnhattrangthai.py`, `sync_detail -> dongbochitiet.py`, `sync_finance -> capnhattaichinh.py`, `retry_label -> taitem.py`. `tiktok_don_hang.py` và `shopee_don_hang.py` giữ cho historical report/Excel, không dùng cho nút kéo nhanh/auto.
- File cũ/trùng: chưa xoá thêm file vì `tiktok_don_hang.py`, `shopee_don_hang.py`, `danhsach_donhang.py`, `browser_donhang.py`, parser và `taitem.py` còn caller rõ qua engine/report worker hoặc vai trò historical. Không tạo wrapper mới.
- Test đã chạy: `python -m py_compile` cho profile map, report worker và action files TikTok/Shopee; `node scripts/test-tiktok-runner-control.mjs`; `node scripts/test-oms-resync-panel.mjs`; profile map probe xác nhận API shops bị `api_shop_chrome_blocked`, còn TikTok/Shopee no-API được allowed.
- Runtime local helper đã restart đúng PID helper, không đụng Chrome. `/health` sau restart trả TikTok `profile_dir=E:\shophuyvan-python-automation\profiles\browser\shophuyvan-runner-tiktok`, `state=paused`, `pause_reason=default_pause_after_restart`, không còn dùng `E:\codex-chrome-profiles`.
- API production đã kiểm thật ở mức an toàn ngày 2026-05-21: Shopee API `chihuy1984`, `chihuy2309`, `phambich2312` gọi `/api/orders/sync-api-orders` và `/api/orders/sync-api-status` với `limit=1`, `fetch_fees=0`, `suppress_push=1`, đều HTTP 200; status sync mỗi shop `checked=1`, `updated=0`. Lazada API gọi cùng flow, status/trace `checked=1`, `updated=1`. Không gọi Finance/Payment sync, không gọi live message, không gọi ship/arrange/confirm/cancel.
- OMS readback production sau API sync: Shopee API rows có `source=API`, không thấy dòng bị gắn Seller Center trong 20 dòng/shop; Lazada rows có `source=API`, tracking có dữ liệu, `finance_source=missing:lazada_finance_api`, `profit_label=Lãi tạm tính`, không nâng thành actual income; TikTok rows giữ `source=Manual`, `profit_label=Lãi tạm tính` khi chưa có settlement.
- Shopee no-API `khogiadungcona` đã chạy Chrome thật:
  - Job cũ `658` `sync_detail` dùng `platforms/shopee/orders/dongbochitiet.py`, profile `E:\shophuyvan-python-automation\profiles\browser\HuyVan_Bot_Data_khogiadungcona`, parsed `3`, touched/updated `3`, readback có `status/tracking/items`, `error_count=0`.
  - Job mới `1168` `pull_orders` dùng `platforms/shopee/orders/keodonmoi.py`, parsed `3`, updated `3`, `api_request_id=import-orders-v2-1779343197560-u0uctc`, readback after đủ `source_detail=platforms/shopee/keodonmoi.py`, `error_count=0`.
  - Trước đó job `1166` fail vì readback OMS gặp HTTP 503 sau khi gửi import; đã sửa `oms_python/core/orders/oms_importer.py` để readback retry 3 lần và trả lỗi có kiểm soát thay vì làm sập runner.
- TikTok `0909128999` đã chạy Chrome thật:
  - Job `1171` `pull_orders` dùng đúng profile `E:\shophuyvan-python-automation\profiles\browser\shophuyvan-runner-tiktok`, đăng nhập hợp lệ, clear filter, nhưng `orders_scanned=0`. Debug theo rule lưu tại `E:\shophuyvan-runtime\debug-payloads\tiktok-zero-orders-20260521T060600`, body có mã đơn nhưng table layout không còn nhãn `ID đơn hàng:`.
  - Đã sửa `platforms/tiktok/orders/danhsach_donhang.py` thêm table-layout fallback. Test trên body thật bắt được 4 đơn mẫu.
  - Job `1172` sau sửa pass: parsed/imported/readback `28` đơn, `api_request_id=import-orders-v2-1779343904257-ute16p`, `parsed_status=true`, `parsed_tracking=true`, `parsed_items=true`, `error_count=0`, `source_detail=platforms/tiktok/keodonmoi.py`.
- Chặn production còn mở: `/api/orders/manual-sync/backfill` trên production vẫn đang trả runner profile cũ `E:\codex-chrome-profiles\shophuyvan-runner-tiktok` / `shophuyvan-runner-shopee-khogiadungcona` và chỉ nhận `pull_orders`, `refresh_status`; `sync_detail`, `sync_finance`, `retry_label` trả 400. Local dirty code đã có route/action đầy đủ nhưng chưa deploy được vì worktree bẩn rộng.
- Browser production bằng profile user `E:\codex-chrome-profiles\shophuyvan-test` đã mở OMS và đọc được bảng thật; script kiểm rộng `scripts/check-oms-hotfix-production.mjs` bị timeout ở bước drawer/resync panel nên chưa được tính pass browser desktop/tablet/mobile cho lượt này.
- Chưa deploy: worktree repo đang bẩn rộng ngoài phạm vi automation/profile, nên không deploy để tránh đẩy nhầm thay đổi không liên quan.

## 20. Cập nhật 2026-05-21 - Chốt production manual sync/backfill và OMS resync

Mục này supersede các blocker production ở mục 19. Lượt này chỉ sửa/deploy/kiểm trong phạm vi manual sync/backfill, retry label, OMS resync panel và profile diagnostic; không refactor lan man sang domain khác.

- Worktree vẫn bẩn rộng từ các lượt trước. Đã phân loại trước deploy và chỉ đụng phạm vi:
  - Worker/API: `apps/worker-api/src/routes/orders/manual-sync-backfill.js`, `apps/worker-api/src/routes/labels/index.js`.
  - Static UI: `apps/fe/js/modules/oms-resync-panel.js`.
  - Local Python tối thiểu: `E:\shophuyvan-python-automation\oms_python\platforms\shopee\orders\taitem.py`, `E:\shophuyvan-python-automation\oms_python\core\automation_profiles.py`.
  - Docs: file trạng thái này và `docs/marketplace-endpoint-progress.md`.
- Deploy Worker chính `huyvan-worker-api`: version `190ce4a6-1bd2-4928-94dd-227395894665`, Cloudflare account `efe50fab1dd644088d681fb14a4838ae`.
- Deploy Static/OMS `shophuyvan-analytics`: version `b9b42d5b-545d-4807-b004-906580017619`, Cloudflare account `efe50fab1dd644088d681fb14a4838ae`.
- `/api/orders/manual-sync/backfill` production hiện nhận đủ `pull_orders`, `refresh_status`, `sync_detail`, `sync_finance`, `retry_label`; không còn trả runner profile trong `E:\codex-chrome-profiles`.
- Diagnostic route production:
  - Shopee no-API `khogiadungcona`: `pull_orders`, `refresh_status`, `sync_detail`, `retry_label` trả HTTP 200, `local_runner_required=true`, profile `E:\shophuyvan-python-automation\profiles\browser\HuyVan_Bot_Data_khogiadungcona`, `stale_profile=false`.
  - TikTok `0909128999`: `pull_orders`, `refresh_status`, `sync_detail`, `sync_finance`, `retry_label` trả HTTP 200, `local_runner_required=true`, profile `E:\shophuyvan-python-automation\profiles\browser\shophuyvan-runner-tiktok`, `stale_profile=false`.
  - Shopee API `chihuy1984`, `chihuy2309`, `phambich2312`: route trả `source=Open Platform / Worker API`, `local_runner_required=false`, `api_shop_chrome_blocked=true`, `chrome_profile_path=""`; không chạy Chrome.
  - Lazada API `kinhdoanhonlinegiasoc@gmail.com`: route trả `source=Open Platform / Worker API`, `local_runner_required=false`, `api_shop_chrome_blocked=true`, `chrome_profile_path=""`; không chạy Chrome. Finance chỉ kiểm endpoint/dry-run, không sync Payment live.
- OMS production bằng profile user `E:\codex-chrome-profiles\shophuyvan-test` đã kiểm thật:
  - Tab `Tải lại tem lỗi` có `action_type=retry_label`, gọi `/api/label/retry-failed` dry-run với `scope=label_pdf,label_status`.
  - Tab `Kéo đơn / Trạng thái` có đủ `Kéo đơn mới`, `Cập nhật trạng thái`, `Đồng bộ chi tiết`, `Cập nhật tài chính`.
  - Payload dry-run bắt qua Network CDP: TikTok gửi đúng `pull_orders`, `refresh_status`, `sync_detail`, `sync_finance`; Shopee no-API gửi đúng `sync_detail`; Shopee API `chihuy1984` gửi đúng `refresh_status`; Lazada API gửi đúng `sync_finance`; label gửi đúng `retry_label`.
  - Selector platform/shop là `<select>` và gửi value kỹ thuật (`0909128999`, `khogiadungcona`, `chihuy1984`, `kinhdoanhonlinegiasoc@gmail.com`), không gửi display text làm shop id.
  - Responsive modal pass ở desktop `1366x900`, tablet `820x1180`, mobile `390x844`; tab label và tab orders đều không tràn ngang, không phơi raw stack/error dài trong modal.
- Local/Python không refactor lại. Chỉ thêm alias guard rỗng trong `taitem.py` để test khóa nút nguy hiểm pass và ghép literal forbidden profile root trong `automation_profiles.py` để runtime vẫn chặn profile user nhưng diagnostic không phát tán path `E:\codex-chrome-profiles`.
- Local pass kế thừa từ lượt trước vẫn là nguồn e2e runner:
  - Shopee no-API `khogiadungcona`: `sync_detail` parsed/updated `3/3`, `pull_orders` parsed/updated `3/3`, OMS readback đủ.
  - TikTok `0909128999`: sau khi sửa parser table-layout, job parsed/updated/readback `28/28`.
  - Lượt này không chạy Payment live, không retry label live hàng loạt, không gửi tin live, không gọi ship/arrange/confirm/cancel.
- Test cuối:
  - `node --check` các JS sửa: pass.
  - `npm test` trong `apps/worker-api`: pass.
  - Guard: `test-tiktok-runner-control`, `test-oms-resync-panel`, `test-order-data-source-routing`, `test-label-download-capability`, `test-finance-taxonomy`, `test-oms-auto-scheduler`, `test-shop-runner-diagnostic`: pass.
  - `python -m py_compile` các Python sửa: pass.
  - `git diff --check`: pass, chỉ cảnh báo CRLF.
  - Mojibake scan hẹp: không có mojibake mới trong file sửa.
- Scan runtime automation: không còn literal `E:\codex-chrome-profiles` trong các file runtime/route/UI đã kiểm.

## 21. Cập nhật 2026-05-21 - Gộp vận hành vào Auto, bỏ nút chạy tay

Mục này supersede phần OMS resync panel ở mục 20. Theo phản hồi UI mới nhất, cụm `Đồng bộ & tải lại` và các nút topbar chạy tay gây hiểu lầm nên đã gỡ khỏi production; các action vận hành được đưa vào modal `Tự động vận hành`.

- Worker chính `huyvan-worker-api` deploy lại version `c751b46c-3a8b-4dc5-a872-058605d49c6b`, account `efe50fab1dd644088d681fb14a4838ae`.
- Static/OMS `shophuyvan-analytics` deploy lại version `9fb2b1a8-d638-41a4-a0ef-ddd73f9cd713`, account `efe50fab1dd644088d681fb14a4838ae`.
- Production `/api/orders/manual-sync/backfill` vẫn nhận đủ `pull_orders`, `refresh_status`, `sync_detail`, `sync_finance`, `retry_label`; TikTok và Shopee no-API trả profile trong `E:\shophuyvan-python-automation\profiles\browser`; không còn trả runner profile trong `E:\codex-chrome-profiles`.
- Shop API `chihuy1984`, `chihuy2309`, `phambich2312`, Lazada `kinhdoanhonlinegiasoc@gmail.com` trả `source=Open Platform / Worker API`, `local_runner_required=false`, `api_shop_chrome_blocked=true`, `chrome_profile_path=""`; không chạy Chrome.
- Static OMS production đã bỏ `btnResyncPanel`, `openResyncPanel`, `triggerBotScrape`, `triggerBotStatus`, `syncOrders` khỏi topbar/runtime OMS. Nút `Làm mới` chỉ refresh bảng hiện tại; không gọi route đồng bộ sàn.
- Modal production `Tự động vận hành` có đủ 5 action tự động: `pull_orders`, `refresh_status`, `sync_detail`, `sync_finance`, `retry_label`. Tất cả toggle đang ON trong `/api/bot/settings` và local helper `/scheduler/config`.
- Local helper/Radar đã restart đúng PID riêng, không `taskkill chrome.exe`. `/health` sau restart: `scheduler_running=true`, `auto_order_enabled=true`, `auto_status_enabled=true`, `auto_detail_enabled=true`, `auto_finance_enabled=true`, `auto_label_enabled=true`.
- Auto runner đã chạy thật sau khi bật:
  - `pull_orders`: TikTok job `1177` completed, Shopee no-API job `1179` completed.
  - `refresh_status`: TikTok job `1181` completed, Shopee no-API job `1184` completed.
  - `sync_detail`: TikTok job `1188` completed; Shopee no-API không có đơn eligible trong batch này.
  - `sync_finance`: không có đơn eligible trong batch này, không sync Payment live.
  - `retry_label`: phát hiện lỗi local runner `wrong_action_type_for_order_runner: retry_label` ở job `1189/1190`; đã sửa `run_report_jobs.py` để job có `from/to` nhưng `action_type=retry_label` không bị ép về `don_hang`. `python -m py_compile` pass; cần để lượt auto kế tiếp hoặc safe sample xác nhận label retry completed.
- Đã dọn queue production trong phạm vi an toàn: 371 job Seller Center cũ của shop API bị chuyển `failed` với log `api_shop_chrome_blocked`, không còn pending API Seller Center fallback trong `/api/jobs`.
- Browser production bằng profile user `E:\codex-chrome-profiles\shophuyvan-test` pass desktop `1366x900`, tablet `820x1180`, mobile `390x844`: không còn nút/panel legacy, modal Auto có đủ 5 action, không có nút chạy tay trong modal, không tràn ngang.
- Test chạy lại: `npm test` trong `apps/worker-api` pass; `node --check` các JS/scripting sửa pass; `python -m py_compile` các file Python sửa pass. Chưa ghi “done tuyệt đối” cho `retry_label` e2e vì lần auto đầu đã lộ lỗi runner và chỉ mới sửa code, chưa có lượt retry_label completed sau sửa.

# 2026-05-21 - Final Core/Warehouse Seller Center e2e evidence

- Worker chính `huyvan-worker-api` deploy mới nhất version `5a4202d0-4646-4925-af1b-062a05f4413c`; Static/OMS `shophuyvan-analytics` version mới nhất `da45c607-da90-43e1-bd81-b3a1eb14d221` (supersede `28ee735a-9118-4851-80a9-db7fc815c57f` để sửa nhãn popup finance TikTok).
- Đã đọc lại `AGENTS.md`, Skill `shophuyvan-warehouse-core-guard`, Skill `shophuyvan-automation-guard`, `warehouse-core-map`, `core-data-map`, `shop-order-product-core-plan`, `chat-refactor-map`, `marketplace-endpoint-master-checklist` và `marketplace-endpoint-progress` trước khi sửa.
- TikTok finance sample `584123080227784403`: mở thật bằng profile `E:\shophuyvan-python-automation\profiles\browser\shophuyvan-runner-tiktok`, bấm thật nút `Xem chi tiết` trên URL finance transaction, parse panel `Chi tiết quyết toán`.
- TikTok Finance Core readback: `gross_revenue=89.000`, `estimated_income=67.755`, `settlement_total=67.755`, `actual_income=null`, `actual_income_available=false`, `settlement_status=pending_settlement`, `finance_source=tiktok_seller_center_finance_transaction`, `finance_confidence=estimated`, `fee_api_total=21.245`, `marketplace_fee_total=19.910`, `tax_total=1.335`. SFR/cost setting `1.620` không còn được map thành thực nhận ví.
- TikTok order detail sample `584128214410102531`: mở thật URL order detail, bấm `Thông tin kho vận`, Tracking Core có `tracking_number=TTVN1088367610`, carrier `BEST Express`, source `tiktok_seller_center_logistics_drawer`, `tracking_events_count=3`. Customer reveal đã bấm icon mắt nhưng Seller Center vẫn trả masked value (`n****************4` và phone dạng masked/partial), nên Core giữ trạng thái masked/không coi là dữ liệu full plaintext.
- TikTok chat từ đơn: đã bấm icon chat trong block khách hàng, mở tab chat `https://seller-vn.tiktok.com/chat/inbox/current?...`; không gửi tin live. Chat route hiện được xác nhận ở mức mở đúng conversation/manual-ready, chưa ghi fake `sent`.
- Retry label sample TikTok `584123080227784403`: dry-run eligible, live job `1226` completed qua `retry_label` sau khi sửa `wrong_action_type_for_order_runner`. PDF local `E:\shophuyvan-runtime\pdf\Phieu_In_PDF\584123080227784403.pdf` hợp lệ `%PDF`, upload server `labels/584123080227784403.pdf`; Label Core readback `label_status=downloaded`, `label_download_mode=local_chrome_retry_label`, `last_label_error=""`.
- Shopee no-API finance sample `260520VPM23704`: mở thật bằng profile `E:\shophuyvan-python-automation\profiles\browser\HuyVan_Bot_Data_khogiadungcona`, parse Seller Center detail `https://banhang.shopee.vn/portal/sale/order/232986368285700`. Finance Core readback: `product_revenue_after_shop_discount=99.000`, `buyer_shipping_paid=8.000`, `platform_voucher_total=21.780`, `buyer_total_paid=85.220`, `seller_cofunded_voucher_amount=6.534`, `platform_funded_voucher_amount=15.246`, `actual_income=70.030`, `settlement_status=confirmed`, `marketplace_fee_total=21.049`, `tax_total=1.387`.
- Shopee tracking sample `260520VPM23704`: đã bấm `Mở rộng`; Tracking Core source `shopee_seller_center_tracking_expanded`, tracking `SPXVN061855241865`, hiện sample Seller Center/Core trả `tracking_events_count=1` với event `Đơn vị vận chuyển lấy hàng thành công`. Không lấy riêng dòng collapsed nếu DOM expanded trả thêm dữ liệu.
- Shopee Chat ngay sample `260520VPM23704`: đã bấm `Chat ngay`, mini chat panel `#shopee-chat-content-container/#messagesContainer` mở đúng khách `thachphamphoto` và order card; không gửi tin live.
- Lazada API shop `kinhdoanhonlinegiasoc@gmail.com`: không dùng Chrome. Đã chạy API-only `/api/orders/sync-api-orders` và `/api/orders/sync-api-status` với `fetch_trace=true`, readback order `528845557532322` có `source_label=API`, tracking `JNTMP0040749797VNA`, status `SHIPPING/SHIPPED`. Label dry-run dùng `order.package.document.get` read-only và trả `not_ready/pending_retry`, không lỗi batch subrequest. Finance actual vẫn thiếu settlement confirmed nên giữ `actual_income_available=false`, `profit_label=Lãi tạm tính`, `finance_source=missing:lazada_finance_api`.
- OMS production bằng profile user `E:\codex-chrome-profiles\shophuyvan-test` đã kiểm desktop `1366x900`, tablet `820x1180`, mobile `390x844`: không tràn ngang, modal `Tự động vận hành` đủ 5 action `pull_orders`, `refresh_status`, `sync_detail`, `sync_finance`, `retry_label`. Popup phí TikTok sample `584123080227784403` sau deploy static mới hiển thị `Doanh thu ước tính 89.000`, `Tổng phí ước tính -21.245`, `Tổng số tiền quyết toán / thực nhận dự kiến 67.755`, không còn `Thực nhận về ví 1.620`.
- Safety: không gửi tin live, không sync Payment live hàng loạt, không gọi `ship_order`/`arrange`/`confirm`/`cancel`, không `taskkill chrome.exe`, không dùng profile user làm automation, không tạo profile tạm.
- Test cuối trong lượt: Python compile/parser tests cho TikTok/Shopee pass; Worker finance/label/source/routing/runner guard tests pass; production readback các đơn mẫu pass. Các output tiếng Việt trên PowerShell có mojibake hiển thị console nhưng API/Core numeric fields đúng.

## 2026-05-21 - Rerun audit Final Core trên worktree bẩn

- Lượt rerun này không được ghi `hoàn thành e2e`: worktree đang bẩn rộng ngoài phạm vi task, nên bản vá local chưa deploy. Phạm vi local đã sửa gồm read model tách sync module/finance health, fee taxonomy TikTok transaction source, TikTok finance-only runner, wait drawer logistics TikTok, auth upload/CCTV/label env guard, và null guard Lazada chat target.
- TikTok chạy thật bằng profile automation `E:\shophuyvan-python-automation\profiles\browser\shophuyvan-runner-tiktok`: `capnhattaichinh.py` đọc transaction panel order `584123080227784403` về Core `gross_revenue=89.000`, `estimated_fee_total=21.245`, `settlement_total=67.755`, `actual_income=null`; `dongbochitiet.py` order `584128214410102531` lấy tracking `TTVN1088367610`, carrier `BEST Express`, `tracking_events_count=3`, customer detail có readback, icon chat mở tab chat theo order và không gửi tin.
- Shopee no-API chạy thật bằng profile automation `E:\shophuyvan-python-automation\profiles\browser\HuyVan_Bot_Data_khogiadungcona`: `dongbochitiet.py` sample `260520VPM23704` readback finance settlement `70.030`, tracking expanded `SPXVN061855241865`, và bấm `Chat ngay` mở textarea chat đúng đơn mà không gửi tin.
- Retry label rerun hiện không pass mới: TikTok dry-run sample `584123080227784403` eligible, live job `1272` route đúng `retry_label -> taitem.py` và không còn `wrong_action_type_for_order_runner`, nhưng TikTok Labels page tại thời điểm chạy không có label đã tạo để tải nên job fail `TikTok không tạo được tem PDF nào trong phiên này`. Không gọi arrange/ship/confirm/cancel.
- Lazada API rerun chỉ dùng Worker API: `POST /api/orders/sync-api-orders` và `/api/orders/sync-api-status` với `limit=1`, `fetch_fees=0`, `fetch_trace=true`, `suppress_push=1` đều `status=ok`, không warning/error. Readback order `528845557532322` giữ `source_mode=api_sync`, tracking `JNTMP0040749797VNA`, `actual_income=null`, `estimated_income=135.300`, `settlement_status=missing_lazada_finance_api`; label dry-run scan 1, queue 0.
- Production chat-target Lazada `GET /api/core/orders/528845557532322/chat-target` hiện trả 500 vì resolver production đọc conversation row `null`. Local patch đã guard `row?.canonical_conversation_id` và test regression, cần deploy sau khi tách diff.
- OMS production đã mở bằng profile user `E:\codex-chrome-profiles\shophuyvan-test` ở desktop `1366x900`, tablet `820x1180`, mobile `390x844`; modal `Tự động vận hành` có đủ `pull_orders`, `refresh_status`, `sync_detail`, `sync_finance`, `retry_label` và không tràn ngang trong lượt kiểm nhẹ.
- CCTV còn dùng: route `/api/cctv/scan-order`, `/api/cctv/upload`, page riêng `apps/fe/pages/cctv_packing.html`, links từ home/OMS/video và local station `oms_python/features/cctv_packing/local_server.py` đều còn caller. Lượt này giữ page riêng ngoài Dashboard và chỉ harden token/mime/size/CORS path; chưa chạy upload video station thật.
- Python web integration hiện có runner/report route, report upload page, purchase admin page và CCTV packing page. Trang chuyên biệt Chat Automation và trang Báo cáo & Đồng bộ sàn theo spec mới chưa được dựng/ nghiệm thu trong rerun này.

## 2026-05-21 - OMS blocker hotfix đã deploy/readback

- Worktree vẫn bẩn rộng từ baseline audit. Snapshot baseline trước sửa: `C:\Users\Admin\AppData\Local\Temp\shv-oms-hotfix-baseline-20260521-205113.txt`. Delta trạng thái mới ngoài baseline chỉ thuộc scope combo/map và script kiểm: `apps/worker-api/src/routes/orders/cost-resolution.js`, `apps/worker-api/src/routes/products/cost-variations-handler.js`, `scripts/test-combo-map-persistence.mjs`, `scripts/check-oms-hotfix-production-final.mjs`.
- Worker/API scope đã deploy: `read-core`, `order-chat-target-core`, `finance-taxonomy-core`, `fee-phase1-core`, `tiktok-seller-center-finance-core`, `labels/index`, `orders/read-update-webhook`, `orders/cost-resolution`, `products/cost-variations-handler`. Worker production `huyvan-worker-api` version cuối `511bb164-f846-4941-bc63-03b46dbecdf0`, account `efe50fab1dd644088d681fb14a4838ae`.
- Static/OMS scope đã deploy: `oms-render.js`, `oms-fee-render.js`, `oms-modals.js`, cache-bust `oms-main.js`, `oms-dashboard-inline-1.js`, `oms-dashboard.html`. Static production `shophuyvan-analytics` version cuối `01cde46c-a646-4bb1-af4e-ad8dd7135cd1`.
- Lazada chat target production `GET /api/core/orders/528845557532322/chat-target` không còn 500; response safe `chat_open_status=not_connected`, `manual_required=true`, `reason=lazada_conversation_not_found`. Không Chrome fallback, không gửi tin live.
- Shopee API bucket: các dòng `READY_TO_SHIP/PROCESSED` nhưng label `pending_document_generation` và thiếu tracking nằm `Chờ Xử Lý / Chưa Xử Lý`; processed query trả `total=0` cho nhóm lỗi. Rule Core không còn dùng marketplace status/carrier để coi là đã xử lý nếu thiếu label + tracking thật.
- TikTok finance production: `584123080227784403` readback `finance_source=tiktok_seller_center_finance_transaction`, `estimated_income=67.755`, `actual_income=null`, `finance_sync_status=pending_settlement`, không cost setting badge/warning/rows. Hai dòng legacy `584117718394898329`, `584116980455670898` không còn map `1.620đ` vào actual income; `sfr_service_fee=tiktok_sfr_fee=1.620`, `actual_income=null`, `pending_settlement`.
- Observed zero/missing: `buyer_shipping_paid=0` chỉ hiển thị 0đ khi parser/Core có observed zero; missing giữ `null` và UI hiện `Chưa có dữ liệu`. `product_original_amount` không copy từ `product_after_discount` nếu không có source quan sát.
- Cost/combo: read model trả `cost_status`, `mapping_status`, `cost_source`, `show_update_cost_button`; row có cost hợp lệ không hiện `Cập nhật Vốn`. Combo map lưu backend vào `product_variations` theo platform/shop/SKU/variation context và test persistence/readback pass. Không tạo mapping live mới trong production nếu không có mapping target an toàn do user chốt.
- Retry label TikTok: production dry-run `/api/label/retry-failed` scan 5, eligible 0, not_ready 5; Label Core sample `584121449968076078` readback `label_status=not_ready`, source `local_python_chrome:platforms/tiktok/orders/taitem.py`. Không chạy live vì không có eligible safe sample; không còn quan sát `wrong_action_type_for_order_runner`.
- Browser production bằng profile user `E:\codex-chrome-profiles\shophuyvan-test`: script `scripts/check-oms-hotfix-production-final.mjs` pass, resources load cache-bust `20260521c`, auto modal đủ `pull_orders`, `refresh_status`, `sync_detail`, `sync_finance`, `retry_label`; desktop/tablet/mobile không tràn ngang. Screenshots: `artifacts/oms-hotfix-20260521-final/desktop-1366x900.png`, `tablet-820x1180.png`, `mobile-390x844.png`.
- Tests pass: `npm --prefix apps/worker-api test`; `npm --prefix apps/worker-api run lint --if-present`; `npm --prefix apps/worker-api run build --if-present`; `npm --prefix apps/fe run lint --if-present`; `npm --prefix apps/fe run build --if-present`; các scripts guard order/chat/label/finance/source/scheduler/runner/Shopee/TikTok/combo; `python -m py_compile` file TikTok automation liên quan; `git diff --check` pass; mojibake scan hẹp không có lỗi mới, chỉ false-positive chữ Việt hợp lệ trong comment cũ.
- Safety: không gửi tin live, không sync Payment live hàng loạt, không gọi ship/arrange/confirm/cancel, không dùng profile user cho automation, không `taskkill chrome.exe`, không hard-code token/cookie.

## 2026-05-21 - OMS Core-first regression lock và bucket Chờ Tem In

- Đã cập nhật guard điều phối: `AGENTS.md`, skill `shophuyvan-warehouse-core-guard`, skill `shophuyvan-automation-guard`, tạo skill `shophuyvan-core-first-guard` ở cả `C:\Users\Admin\.codex\skills` và `skills/`. Rule mới chốt domain routing Core, UI render-only, observed zero/null, cost setting fallback, API status là `marketplace_status`, và xoá code/route/helper/fallback thừa sau khi search caller.
- Shopee Open Platform docs đã mở bằng Chrome profile user `E:\codex-chrome-profiles\shophuyvan-test`; endpoint tem chính thức xác nhận: `get_shipping_document_parameter`, `create_shipping_document`, `get_shipping_document_result`, `download_shipping_document`. Required fields: `order_sn`, `package_number`, `tracking_number`, `shipping_document_type`, common auth `shop_id/partner_id/timestamp/sign/access_token`; response có `request_id`, `result_list.status=READY/PROCESSING/FAILED`, `fail_error/fail_message`, PDF trả `waybill` hoặc lỗi `logistics.shipping_document_should_print_first`.
- Worker/API deploy production cuối `huyvan-worker-api` version `a89f228f-a767-4bd3-87c5-bdbe38dcdd2b`, account `efe50fab1dd644088d681fb14a4838ae`. Static/OMS deploy production cuối `shophuyvan-analytics` version `b756f2fa-3ba4-41f0-8041-4a182d5e1907`.
- Order/Status Core fix: Shopee API có tracking thật nhưng thiếu/đang tạo tem không còn vào `Chưa Xử Lý`; read-model trả `tracking_sync_status=complete`, `label_sync_status=pending_document_generation`, `operation_sync_status=waiting_label_file`, `oms_processing_bucket=waiting_label`, `left_nav_subgroup=Chờ Tem In`. `Chưa Xử Lý` chỉ còn các dòng tracking missing theo Core.
- Count/list production: UI tab `Chờ Tem In` hiện `23`; list `/api/orders?status=PENDING&platform=shopee&shipping_status=WAITING_LABEL` trả `total=23`, các dòng sample đều có tracking thật và label pending. Tab/query `Chưa Xử Lý` production trả `total=8`, toàn bộ sample có `tracking_sync_status=missing`, `operation_sync_status=pending_label`, không có tracking.
- Shopee finance lineage `2605211PH999WY`: production readback `payment_method_display=SPayLater`, `payment_method_source=order_fee_details.raw_data`, `product_original_amount=90.000`, `product_original_amount_source=derived:product_revenue_after_shop_discount+shop_discount_amount`, `finance_source=order_fee_details.raw_data`, `finance_sync_status=complete`; UI popup production có `SPayLater` và `90.000đ`.
- Shopee regression `260520VPM23704`: production giữ `actual_income=70.030`, `product_revenue_after_shop_discount=99.000`, `buyer_shipping_paid=8.000`, `platform_voucher_total=21.780`, `buyer_total_paid=85.220`, `seller_cofunded_voucher_amount=6.534`, không cost setting.
- TikTok finance `584123080227784403`: production readback `finance_source=tiktok_seller_center_finance_transaction`, `estimated_income=67.755`, `actual_income=null`, `finance_sync_status=pending_settlement`, `finance_needs_resync=false`, `buyer_shipping_paid=0`, `product_original_amount=null`; UI không hiện cost setting badge/rows, không map `1.620đ` thành actual income, SFR/service fee giữ đúng.
- Cost/combo: Core/read-model trả `show_update_cost_button` và `show_update_mapping_button`; FE `oms-render.js` chỉ render hai cờ này, không tự tính cost/mapping bằng `Number(... || 0)`. Row có vốn trong production check không hiện `Cập nhật Vốn`. Combo map persistence guard pass, rule mới ghi rõ Product/Warehouse Core quản combo map và sync không xoá map.
- Lazada chat-target production `GET /api/core/orders/528845557532322/chat-target`: HTTP 200, `chat_open_status=not_connected`, `manual_required=true`, `reason=lazada_conversation_not_found`; không Chrome fallback, không gửi tin live.
- TikTok retry_label dry-run production `/api/label/retry-failed` với `platform=tiktok`, `shop=0909128999`: `dry_run=true`, `eligible=3`, `not_ready=7`, `queued=0`, `errors=0`, action `retry_label`, không live. Sample not_ready giữ `label_status=not_ready`, source `local_chrome_retry_label`; không có `wrong_action_type_for_order_runner`.
- Regression lock mới: `scripts/check-oms-core-regression-lock.mjs` pass 11 case bắt buộc gồm Shopee bucket, Shopee finance lineage, TikTok finance, observed zero/missing, cost button, combo map, Lazada chat-target, TikTok retry_label. Script dùng Core fixture và read-only production GET, không POST live nguy hiểm.
- Browser production bằng profile user `E:\codex-chrome-profiles\shophuyvan-test` pass desktop `1366x900`, tablet `820x1180`, mobile `390x844`; không tràn ngang. UI readback: `Chưa Xử Lý` hiển thị `Trang 1 / 1 — 8 đơn`, không có tracking; `Chờ Tem In` hiển thị `Trang 1 / 1 — 23 đơn`, toàn bộ sample có tracking. Screenshots: `artifacts/oms-core-lock-20260521-final/desktop-1366x900.png`, `tablet-820x1180.png`, `mobile-390x844.png`.
- Tests pass: `npm test` trong `apps/worker-api`; `npm run lint --if-present` và `npm run build --if-present` trong `apps/worker-api` và `apps/fe`; các scripts guard bắt buộc gồm chat-target, sync completeness, TikTok finance, finance taxonomy, label capability, auto settings/scheduler, source routing, shop runner diagnostic, Shopee seller detail, combo persistence, regression lock. `python -m py_compile` pass cho runner liên quan `run_report_jobs.py`, `platforms/tiktok/orders/taitem.py`, `automation_profiles.py`.
- Worktree hygiene: baseline vẫn bẩn rộng từ các lượt trước; không revert. Lượt này không xoá thêm file vì caller active/dirty baseline chưa đủ điều kiện xoá an toàn. Đường đi vòng Core trong phạm vi bucket/finance đã bị sửa tại caller/read-model thay vì giữ fallback song song.

## 2026-05-22 - OMS Core-first date scan và TikTok finance lock

- Guard/docs đã đọc trước sửa: `AGENTS.md`, `shophuyvan-core-first-guard`, `shophuyvan-warehouse-core-guard`, `shophuyvan-automation-guard`, `shophuyvan-label-tracking-core-guard`, `shophuyvan-finance-core-guard`, `shophuyvan-order-core-guard`, `PROJECT-CURRENT-STATE`, `warehouse-core-map`, `core-data-map`, `marketplace-endpoint-master-checklist`, `marketplace-endpoint-progress`.
- Worker/API deploy cuối `huyvan-worker-api` version `d2d301c5-d2f3-4216-ae78-2bea4fd95cba`, account `efe50fab1dd644088d681fb14a4838ae`. Static/OMS deploy trong lượt này version `5594b59c-c1f8-41b9-b915-d00c8d2892d9`.
- TikTok order `584117718394898329` production readback sau runner job `1310`: `finance_source=tiktok_seller_center_detail`, `payment_method=Thanh toán khi giao hàng`, `product_original_amount=119.000`, `product_revenue_after_shop_discount=65.000`, `buyer_shipping_paid=0`, `buyer_total_paid=65.000`, `estimated_income=63.380`, `actual_income=null`, `settlement_status=pending_settlement`, `finance_sync_status=pending_settlement`, `finance_needs_resync=true`, `tiktok_sfr_fee=1.620`, `ops_cost_setting_total=0`.
- Parser TikTok `sync_finance` đọc trang chi tiết đơn trước để giữ breakdown khách thanh toán và SFR; transaction pending không được phủ mất breakdown detail. `Số tiền bạn kiếm được` trùng SFR không được nâng thành actual income.
- Finance Core taxonomy không cho `fee_piship` TikTok Seller Center detail đi vào internal/cost setting; SFR được giữ là fee line Seller Center, không phải actual income và không phải cost setting.
- `/api/orders/manual-sync/backfill` thêm date scan Core-first với `platform`, `shop`, `action_type`, `from_date`, `to_date`, `date_field`, `limit`, `dry_run`, `selected_order_ids`. `scan_all_errors` chỉ dry-run; live chạy bằng danh sách selected từ preview.
- Queue read-model mới: `label_retry_queue`, `finance_resync_queue`, `tracking_resync_queue` trả đủ field bắt buộc và chỉ dựa Order/Label/Finance/Tracking Core.
- Production dry-run: `retry_label` TikTok 2026-05-01..2026-05-22 trả `total_orders_in_date_range=322`, `eligible_count=10`, `skipped_count=0`; `sync_finance` cùng khoảng trả `eligible_count=10`; `refresh_tracking` ngày 2026-02-27 trả `total_orders_in_date_range=15`, `eligible_count=10`, sample tracking `861336335106` có timeline rỗng trong queue; `scan_all_errors` ngày 2026-05-20 trả `total_orders_in_date_range=20`, `eligible_count=10`, `dry_run=true`.
- Live selected run: date scan chọn riêng order `584117718394898329`, tạo job `1310`, runner local profile `E:\shophuyvan-python-automation\profiles\browser\shophuyvan-runner-tiktok`, final `completed`, parsed/touched/updated `1/1/1`, Core readback đúng sau deploy.
- UI production bằng profile `E:\codex-chrome-profiles\shophuyvan-test` đang bị auth guard chuyển về login; chưa pass thao tác modal sau deploy trong profile này. API/runner/readback production đã pass. Cần đăng nhập lại profile user để kiểm modal bằng browser thật.
- Safety: không gọi `ship_order`, `arrange`, `confirm`, `cancel`; không gửi tin live; không chạy Payment live batch; không dùng `taskkill chrome.exe`; automation dùng profile riêng trong `E:\shophuyvan-python-automation\profiles\browser`, không dùng profile user.

## 2026-05-22 - OMS vận hành settings, label/tracking validity và pipeline truth

- Guard/docs đã đọc trước sửa: `AGENTS.md`, `shophuyvan-core-first-guard`, `shophuyvan-warehouse-core-guard`, `shophuyvan-automation-guard`, `shophuyvan-label-tracking-core-guard`, `shophuyvan-finance-core-guard`, `shophuyvan-order-core-guard`, `PROJECT-CURRENT-STATE`, `warehouse-core-map`, `core-data-map`, `marketplace-endpoint-master-checklist`, `marketplace-endpoint-progress`, `python-automation`.
- Cập nhật `AGENTS.md` và skill guard Core/Automation/Label-Tracking/Finance/Order: sau sửa OMS bắt buộc mở OMS production, thao tác đúng màn hình lỗi, có Core readback + OMS readback; automation/Radar/job queue phải kiểm pipeline thật đến trạng thái cuối, không coi queued/running là pass; production UI còn tái hiện lỗi thì không được ghi hoàn thành e2e; legacy route/helper/fallback phải search caller rồi reroute qua Core hoặc xoá trong phạm vi an toàn.
- Worker/API production deploy cuối `huyvan-worker-api` version `8f44004b-e9f9-401e-b7a5-a3bc8537438a`, account `efe50fab1dd644088d681fb14a4838ae`. Static/OMS production deploy cuối `shophuyvan-analytics` version `579a5d63-c799-45c5-bb86-5fdd93f54c2a`.
- UI OMS production bằng profile `E:\codex-chrome-profiles\shophuyvan-test` pass desktop `1366x900`, tablet `820x1180`, mobile `390x844`: nút `Cài đặt vận hành` nằm cuối sidebar trái, mở modal có tab `Cài tự động` và `Chạy thủ công`; tab thủ công có `Kéo đơn mới`, `Cập nhật trạng thái`, `Đồng bộ chi tiết`, `Đồng bộ tài chính`, `Quét lại tracking`, `Tải lại tem lỗi`, `Tổng hợp lỗi`; có đủ nút `Xem trước danh sách`, `Chạy các đơn đã chọn`, `Làm mới trạng thái job`, `Copy log`; không tràn ngang trong 3 viewport.
- Label/Tracking Core fix: `.html/.htm` hoặc `text/html` không còn được coi là tem hợp lệ; `Đã tải tem` chỉ hiện khi `label_valid=true` và file tem hợp lệ. Order `26052234JG8TET` production hiện có tracking `SPXVN069008328815` từ source mới, label file `labels/26052234JG8TET.html`, `label_valid=false`, `label_status=missing_file`, bucket `waiting_label`; row không còn hiện `Đã tải tem`, drawer không còn timeline `Đã đóng gói` giả. Order `2605212129FVB4` tracking `SPXVN068204398575`, label file `labels/2605212129FVB4.html`, `label_valid=false`, `label_status=missing_file`, bucket `waiting_label`; row không còn hiện `Đã tải tem`.
- TikTok `584116980455670898` production readback: `product_revenue_after_shop_discount=75.000`, `buyer_shipping_paid=0`, `estimated_income=73.380`, `actual_income=null`, `settlement_status=pending_settlement`, `finance_source=tiktok_seller_center_detail`, `sfr_service_fee=1.620`. UI popup hiện SFR là fee line và không hiện cost setting; `payment_method` và `product_original_amount` vẫn đang thiếu trong raw/Core hiện tại nên UI giữ `Chưa có dữ liệu`, không bịa dữ liệu.
- Pipeline/job truth: `/api/jobs?mode=monitor` production sau deploy cho thấy job `1337` TikTok retry_label và `1338` Shopee retry_label có `runner_picked`, `browser_launch_requested`, `browser_launched`, đúng profile automation (`shophuyvan-runner-tiktok` và `HuyVan_Bot_Data_khogiadungcona`), rồi kết thúc `failed` vì `action_skipped:no_eligible_orders`; job `1289` được chuyển `runner_timeout`. Đây là trạng thái thật, không còn coi queued/running/no-op là completed. Chưa đủ điều kiện ghi hoàn thành e2e toàn bộ action suite vì chưa chạy pass fresh live sample cho tất cả `pull_orders`, `refresh_status`, `sync_detail`, `sync_finance`, `refresh_tracking`, `retry_label`.
- Tests pass: `node scripts/check-oms-core-regression-lock.mjs`; `npm test`, `npm run lint --if-present`, `npm run build --if-present` trong `apps/worker-api`; `npm run lint --if-present`, `npm run build --if-present` trong `apps/fe`; `node --check` các JS sửa; không sửa Python trong lượt này nên không có `py_compile`; `git diff --check` exit 0 với cảnh báo CRLF hiện có.
- Safety: không gọi `ship_order`, `arrange`, `confirm`, `cancel`; không gửi tin live; không chạy Payment live batch; không dùng `taskkill chrome.exe`; automation runner dùng profile trong `E:\shophuyvan-python-automation\profiles\browser`; không hard-code token/cookie. `gh` CLI không có trong PATH nên chưa chạy được `gh auth status`/`gh repo view`.

## 2026-05-22 - OMS manual Core shop, Radar no-op guard và TikTok fee/tracking readback

- Guard/docs đã đọc trước sửa: `AGENTS.md`, `shophuyvan-core-first-guard`, `shophuyvan-warehouse-core-guard`, `shophuyvan-automation-guard`, `shophuyvan-label-tracking-core-guard`, `shophuyvan-finance-core-guard`, `shophuyvan-order-core-guard`, `PROJECT-CURRENT-STATE`, `warehouse-core-map`, `core-data-map`, `marketplace-endpoint-master-checklist`, `marketplace-endpoint-progress`, `python-automation`.
- Worker/API và Static/OMS đã deploy production lại trong lượt này bằng profile `DuAn_shophuyvan-analytics`, account Cloudflare `efe50fab1dd644088d681fb14a4838ae`. Worker deploy ghi nhận version `0cac3a19-e1f4-41c7-a996-93b988548b14`; Static deploy đầu lượt ghi nhận version `6e4e2139-f70a-493b-a3cf-222cbdedc9f3`; sau đó Static/Worker được redeploy lại để cập nhật Core readback và render tracking/fee.
- UI OMS production bằng profile user `E:\codex-chrome-profiles\shophuyvan-test` pass desktop `1366x900`, tablet `820x1180`, mobile `390x844`: không tràn ngang; modal `Cài đặt vận hành` có tab `Chạy thủ công`; `Sàn` và `Shop` là `select` từ Core; shop TikTok hiển thị `Shop chưa đồng bộ tên · Tham chiếu tay · 2265 đơn`; action thủ công chỉ còn `refresh_status`, `retry_label`, `sync_finance`, `refresh_tracking`, `sync_detail`, `scan_all_errors`.
- `pull_orders`/`Kéo đơn mới` không còn nằm trong dropdown thủ công. Nút riêng `Kéo đơn toàn bộ shop` nằm ngoài modal bằng `#btnPullAllCoreShops`; bấm production đã tạo và chạy job thật: TikTok job `1383` completed, Shopee no-API job `1384` completed, job phát sinh `1385` completed.
- Radar/local helper `/health` production local đang chạy `radar_running=true`, PID `18180`; các scheduler action đã có bằng chứng trạng thái cuối: `refresh_status` TikTok `1369` completed và Shopee `1372` completed; `retry_label` TikTok `1378` completed và Shopee `1379` completed; `pull_orders` TikTok `1380/1383` completed và Shopee `1382/1384` completed; `sync_detail` không có eligible trong lượt scheduler hoặc hoàn tất job phát sinh `1385`; `sync_finance` không có eligible scheduler nhưng live selected TikTok `1389` completed.
- Hai job rỗng gây cảm giác mở Chrome rồi không thao tác (`1388`, `1392`) được xử lý đúng pipeline truth: payload không có `selected_order_ids/order_ids`, production đã chuyển `completed_no_change` với log `Core preview không có selected_order_ids/order_ids; không mở Chrome automation cho job rỗng.` Không còn coi job rỗng là lỗi thật hoặc mở Chrome vô ích.
- TikTok tracking order `584118922740139598`: runner `sync_finance` job `1389` completed bằng profile automation `E:\shophuyvan-python-automation\profiles\browser\shophuyvan-runner-tiktok`; Tracking Core/OMS drawer source `tiktok_seller_center_logistics_drawer`, tracking `TTVN1080793108`, ĐVVC `BEST Express`, có 7 logistics events đúng như Seller Center và không còn dòng nội bộ sai kiểu `SKU người bán`, `Giảm giá`, `Phí vận chuyển`, `Tổng cộng`, `Đơn hàng hiện tại`.
- TikTok finance order `584118922740139598`: Core/read-model và OMS popup đã khớp Seller Center. Khách thanh toán: `payment_method=Thanh toán khi giao hàng`, `product_revenue_after_shop_discount=75.000`, `product_original_amount=90.000`, `shop_discount_amount=-15.000`, `buyer_shipping_paid=0`, `platform_voucher_total=0`, `buyer_total_paid=75.000`. Sàn thanh toán: `estimated_revenue=75.000`, `commission_fee=-9.750`, `payment_fee=-4.500`, `fulfillment_fee=-3.000`, `tax_vat=-750`, `tax_pit=-375`, `estimated_fee_total=-18.375`, `estimated_income=56.625`, `actual_income=null/pending settlement`. Lợi nhuận: `56.625 - 26.000 - 0 - 0 = 30.625`.
- UI fee popup production order `584118922740139598` pass cả 4 tab `Khách thanh toán`, `Sàn thanh toán`, `Lợi nhuận`, `Nguồn API`; `Nguồn API` ghi `TikTok Seller Center detail` và settlement chưa quyết toán, không fake `Thực nhận ví`.
- Test cuối: `node scripts/check-oms-core-regression-lock.mjs` pass; `node --check` pass cho các JS/Core file đã sửa; `python -m py_compile` pass cho `oms_radar_tab.py`, `run_report_jobs.py`, `dongbochitiet.py`, `parser_chitiet.py`; `git diff --check` pass cho ba file docs cập nhật, chỉ còn cảnh báo CRLF của worktree Windows.
- Safety: không gọi `ship_order`, `arrange`, `confirm`, `cancel`; không gửi tin live; không chạy Payment live batch; không dùng profile user cho automation; không `taskkill chrome.exe`; chỉ đóng PID Chrome user do phiên kiểm tạo sau khi xác minh command line nếu cần.
- Còn tồn đọng ngoài phạm vi lỗi rỗng: `/api/jobs?mode=monitor` vẫn có một số job queued có `selected_order_ids/order_ids` thật từ các lượt trước; không được báo queue toàn hệ thống đã rỗng nếu chưa xử lý riêng các job đó.

## 2026-05-22 - OMS automation logging, Shopee affiliate fee, stuck label và TikTok status promotion

- Guard/docs đã đọc trước sửa: `AGENTS.md`, `shophuyvan-core-first-guard`, `shophuyvan-warehouse-core-guard`, `shophuyvan-automation-guard`, `shophuyvan-label-tracking-core-guard`, `shophuyvan-finance-core-guard`, `shophuyvan-order-core-guard`, `PROJECT-CURRENT-STATE`, `warehouse-core-map`, `core-data-map`, `marketplace-endpoint-master-checklist`, `marketplace-endpoint-progress`, `python-automation`.
- Deploy production bằng profile `DuAn_shophuyvan-analytics`, Cloudflare account `efe50fab1dd644088d681fb14a4838ae`: Worker `huyvan-worker-api` version `d76dd644-c00c-4d31-8ef6-9b612eecfe8f`; Static/OMS `shophuyvan-analytics` version `a849bb2f-3e04-4a1c-b783-4b8d6b2333da`.
- Shopee Open Platform đã kiểm endpoint Payment `/api/v2/payment/get_escrow_detail`; field `order_ams_commission_fee` được map vào Finance Core là `affiliate_fee` / `Phí hoa hồng Tiếp thị liên kết`. Order `260517M6SFEXD5` production readback `affiliate_fee=11.286`, UI popup tab `Sàn thanh toán` hiện `Phí hoa hồng Tiếp thị liên kết API -11.286đ`.
- Shopee label treo `Chờ Tem In`: label HTML cũ trong R2 không còn được coi là file tem hợp lệ cho Shopee/API; Label Core chỉ nhận PDF thật. Hai đơn `2605211C2HMCTT` và `2605211B36B1W5` đã chạy refresh label qua API chứng từ Shopee chính thức, file trả về `%PDF-`, UI production không còn `invalid_label_file`, có `Phiếu in`/`Đã tải tem`. Mã `2605221CUC26SQ` không tìm thấy trong production API/UI tại thời điểm kiểm.
- TikTok status promotion: khi Tracking Core có event ĐVVC thật, order non-terminal đang `Đã xử lý / sẵn sàng giao` được nâng sang `SHIPPING`/`Đang giao`. Manual live job `1435` cho `refresh_tracking` TikTok `0909128999` completed, scan/update `84/84`, error `0`; order `584123080227784403` readback `raw_platform_status=SHIPPED`, `order_status_core=SHIPPING`, `shipping_status=SHIPPED`, UI production hiện `Đang giao`.
- Parser TikTok table layout đã sửa để lấy đúng order id/date trong layout mới; nếu status-only thiếu date thì dùng scan time và log warning thay vì bỏ qua toàn bộ order.
- Nút `Kéo đơn toàn bộ shop` production đã bấm lại sau cache-bust/CORS fix và có log chi tiết ngay trong modal `Chạy thủ công`: API shop `222/222/0`; local jobs `1468` TikTok completed `quét 3 · tạo 3 · cập nhật 3 · lỗi 0`, `1469` Shopee no-API completed `quét 1 · tạo 1 · cập nhật 1 · lỗi 0`. `/api/jobs` readback khớp terminal `completed`, không chỉ `queued/running`.
- UI production bằng Chrome profile user `E:\codex-chrome-profiles\shophuyvan-test` pass desktop `1366x900`, tablet `820x1180`, mobile `390x844`: modal `Cài đặt vận hành` không tràn ngang, Core shop select còn hoạt động, nút `Kéo đơn toàn bộ shop` mở log panel và cập nhật trạng thái cuối.
- Tests pass sau cập nhật cuối: `node scripts/check-oms-core-regression-lock.mjs`; `node --check` cho các JS/Core file sửa; `python -m py_compile` cho parser TikTok; `git diff --check` trong scope sửa pass, chỉ còn cảnh báo CRLF của worktree Windows.
- Safety: không gọi fulfillment write (`ship_order`, `arrange`, `confirm`, `cancel`), không gửi tin live, không chạy Payment live batch, automation dùng profile riêng trong `E:\shophuyvan-python-automation\profiles\browser`, không `taskkill chrome.exe`.
- Residual: production vẫn có một số job queued cũ có `selected_order_ids/order_ids` thật; không coi là cùng lỗi job rỗng/no-log, cần lượt riêng nếu muốn dọn toàn queue hoặc replay từng job.

## 2026-05-22 - Automation business log, Chat/CSKH send và TikTok parser table layout

- Guard/docs đã đọc trước sửa: `AGENTS.md`, `shophuyvan-core-first-guard`, `shophuyvan-warehouse-core-guard`, `shophuyvan-automation-guard`, `shophuyvan-label-tracking-core-guard`, `shophuyvan-finance-core-guard`, `shophuyvan-order-core-guard`, `PROJECT-CURRENT-STATE`, `warehouse-core-map`, `core-data-map`, `marketplace-endpoint-master-checklist`, `marketplace-endpoint-progress`, `python-automation`.
- Automation Business Log Gate đã thêm vào guard: job không được coi là pass nếu chỉ có lifecycle `queued/running/completed`; phải có `scanned_count`, `created_count`, `updated_count`, `unchanged_count`, `skipped_count`, `failed_count`, `per_order`, `changed_fields`, `skip_reason/error_code`, `core_readback_ok`.
- Local automation `run_report_jobs.py` ghi `business_summary`, `per_order`, `human_log` dạng `[JOB]`, `[ORDER]`, `[SUMMARY]`. UI OMS `Cài đặt vận hành` đọc và hiển thị bảng nghiệp vụ theo job/order, không chỉ hiện dòng "Đã chạy xong".
- TikTok parser table layout không bỏ qua đơn khi layout thiếu ngày giờ; dùng thời điểm quét làm `source_detail=tiktok_table_layout_scan_time` và log cảnh báo rõ. Importer retry HTTP `429/500/502/503/504` để tránh lỗi Worker/D1 thoáng qua làm hỏng lượt parse đã thành công.
- Runner/local helper giữ Chrome automation headful (`headless=false`) và không để watcher cũ chặn job one-shot có `job-id`; UI manual run gửi `watch=false`.
- Production deploy: Worker chính `huyvan-worker-api` version `7984670b-54c8-4cca-93e7-0251a9d61fe4`, Chat Worker `shophuyvan-chat-api` version `673a141e-3542-435f-a645-cf8091d10063`, Static/OMS latest version `2dd84cc8-f0ba-4133-bca0-cd86e98a69e2`. Cloudflare main account `efe50fab1dd644088d681fb14a4838ae`, Chat account `39cf0fe9b3eda88bda53e369770cabeb`.
- Live automation verified bằng Chrome automation profile thật: job `1578` TikTok `sync_detail` completed `scanned=10`, `updated=10`, `failed=0`, `core_readback_ok=true`; job `1579` TikTok `pull_orders` completed `scanned=41`, `created=41`, `updated=41`, `failed=0`; job `1599` TikTok `pull_orders` completed `scanned=48`, `created=48`, `updated=48`, `failed=0`; job `1612` Shopee no-API `pull_orders` completed `scanned=1`, `created=1`, `updated=1`, `failed=0`.
- Chat/CSKH production đã mở bằng profile `E:\codex-chrome-profiles\shophuyvan-test`; gửi thử nội dung an toàn `dạ` cho conversation Shopee API `conv_bd4d34aa-2924-419b-9464-4117eb258a23` thành công, API readback message mới `status=sent`, `platform_message_id=2414740835755540849`.
- Browser production final bằng profile `E:\codex-chrome-profiles\shophuyvan-test`: Chat/CSKH có composer, textarea, nút `Gửi` enabled và message `dạ` hiển thị `Đã gửi`; OMS/modal `Cài đặt vận hành` mở được ở mobile `390x844`, tablet `820x1180`, desktop `1366x900`, không tràn ngang (`scrollWidth` không vượt viewport).
- OMS chat-target Core-first: Shopee API order `2605223P6YTAED` trả `open_chat_allowed=true`, `send_capability=bridge`; TikTok no-API order `584135072506087039` trả `conversation_resolution=browser_helper_queue`, `open_chat_allowed=true`, `shop_chat_mode=browser_helper`.
- Tests pass: `node --check` cho JS/Worker/Chat file đã sửa; `python -m py_compile` cho automation parser/runner/helper; `npx wrangler deploy --dry-run` cho `apps/worker-api`, `apps/chat-worker-api`, `apps/fe`; deploy production pass.
- Job `1637` TikTok `sync_finance` đã kết thúc `completed` sau khi mở Chrome headful bằng profile automation, `scanned=9`, `updated=9`, `failed=0`, `core_readback_ok=true`, có `business_summary` và `per_order`. Scheduler hiện đã dừng loop, nhưng queue nền vẫn còn một số job có selected/order ids thật từ các lượt trước; cần replay/dọn riêng nếu muốn sạch toàn backlog.
- TikTok `retry_label` lỗi phân loại từ job `1638` đã sửa ở local runner: khi Seller Center chưa trả PDF tem sẵn sàng thì ghi `completed_no_change`/`skipped`, không ghi `failed` giả. Job verify `1641` completed bằng Chrome headful, `scanned=1`, `skipped=1`, `failed=0`, `core_readback_ok=true`, per-order `584145278139860092` có `skip_reason=label_pdf_not_ready`.
- `gh` CLI không có trong PATH nên chưa chạy được `gh auth status` và `gh repo view`; đã kiểm repo bằng `git remote`, `git branch`, `git config` và Cloudflare `wrangler whoami`.

## 2026-05-23 - Cleanup UI, scanner camera, product combo, visible runner attach và Chat ingest

- Guard/docs đã đọc trước sửa: `AGENTS.md`, các Skill `shophuyvan-core-first-guard`, `shophuyvan-warehouse-core-guard`, `shophuyvan-automation-guard`, `shophuyvan-label-tracking-core-guard`, `shophuyvan-finance-core-guard`, `shophuyvan-order-core-guard`, Skill mới `shophuyvan-product-core-guard`, `PROJECT-CURRENT-STATE`, `warehouse-core-map`, `core-data-map`, `marketplace-endpoint-master-checklist`, `marketplace-endpoint-progress`, `python-automation`, `shop-order-product-core-plan`, `LEGACY-CLEANUP-AUDIT`.
- Code hygiene trong phạm vi ảnh lỗi: bỏ nút sidebar `Chạy thủ công` ở OMS vì trùng `Cài đặt vận hành`; bỏ panel `Review xấu theo sản phẩm` khỏi Product Master; không xoá refactor Chat/Core untracked đang bẩn rộng vì còn là hướng mới đang active.
- Product Core: tạo Skill `shophuyvan-product-core-guard`; thêm read-model combo trong Product API để combo lấy vốn/giá từ component SKU qua Product Core, không tính vá ở UI. Production `sku` hiển thị `Chưa có giá (0)` và nhóm `Combo (26)`.
- Scanner: `scan-qr` mobile/coarse pointer không còn hiện QR bridge; vào trực tiếp flow camera, gọi `getUserMedia` sau khi mở trang. Production mobile fake-camera `390x844` hiển thị `Camera đã mở`, không tràn ngang.
- Finance Core: TikTok profit popup dùng cost setting cho `ADS ngoài ví` và `PiShip` trong lợi nhuận khi Seller Center không trả dòng này; không đưa vào tổng phí sàn/khấu trừ.
- Shop display Core: shop TikTok manual settings không còn hiện trống `Shop chưa đồng bộ tên`; production modal hiển thị `tiktok 0909128999 · Tham chiếu tay · 2284 đơn`.
- Local automation runner: `run_report_jobs.py` luôn headful, log `headless=false`, và khi profile đã có Chrome helper mở bằng port khác thì tự nhận port hiện hữu rồi mở tab mới, không mở chồng profile/không kill Chrome. Job TikTok live `1983` pass: `pull_orders`, scanned/created/updated `8/8/8`, parsed status/tracking/items `true`, `core_readback_ok=true`, dùng profile `E:\shophuyvan-python-automation\profiles\browser\shophuyvan-runner-tiktok`, attach port `9509`, browser visible.
- Chat Worker: thêm route `POST /api/chat/automation-ingest` vào Worker riêng `shophuyvan-chat-api` để browser helper TikTok/Shopee ghi về Chat Core, dedupe theo `platform_message_id`, cập nhật `chat_sync_state`. Chat Worker deploy production version `7c6f8aaf-0c4c-4bf3-87e2-65b556a6d8ba`, account `39cf0fe9b3eda88bda53e369770cabeb`.
- Chat verify thật: `POST http://127.0.0.1:8765/chat-sync` TikTok lần 1 đọc `2` tin, ingest lưu `2`; chạy lại lần 2 lưu `0`, `skipped_duplicates=2`. UI production `chat-cskh` filter TikTok hiển thị shop `0909128999`, conversation `Browser helper`, không còn badge `Không sync` cho conversation mới, không tràn ngang mobile/tablet/desktop.
- Deploy production: Worker chính `huyvan-worker-api` version `2982223c-6a39-4298-9981-a31bad61ee6b`, Static `shophuyvan-analytics` version `cc608f4c-7517-464a-ab3f-1e39dc30e5bb`, Chat Worker `shophuyvan-chat-api` version `7c6f8aaf-0c4c-4bf3-87e2-65b556a6d8ba`.
- Browser production verify bằng profile `E:\codex-chrome-profiles\shophuyvan-test`: OMS desktop có `Kéo đơn toàn bộ shop`, `Cài đặt vận hành`, không còn text/button `Chạy thủ công`; OMS mobile/tablet/desktop không tràn ngang; Product Master không còn `Review xấu theo sản phẩm`; Chat mobile/tablet/desktop không tràn ngang; scanner mobile camera-first pass.
- Tests pass: `npm run check` trong `apps/chat-worker-api`; `node --check` cho Worker/FE JS đã sửa; `python -m py_compile` cho `run_report_jobs.py` và browser lifecycle helper; Cloudflare `wrangler whoami` pass cho main account `efe50fab1dd644088d681fb14a4838ae` và chat account `39cf0fe9b3eda88bda53e369770cabeb`.
- Chưa hoàn thành toàn bộ ảnh lỗi: Shopee no-API order `2605224DM1F50H` được queue live job `1985` `sync_detail`, runner mở đúng profile `E:\shophuyvan-python-automation\profiles\browser\HuyVan_Bot_Data_khogiadungcona`, login sẵn, attach port `9319`, nhưng Seller Center detail kết thúc `failed` với `seller_center_detail_url_not_found`, `core_readback_ok=false`. Không được báo lỗi Shopee tracking/payment này đã fix xong cho tới khi lấy được detail/tracking và OMS readback pass.

## 2026-05-23 - OMS pull-all/status-only finance guard, visible automation và Chat sync settings

- Guard/docs đã đọc trước sửa: `AGENTS.md`, `shophuyvan-core-first-guard`, `shophuyvan-warehouse-core-guard`, `shophuyvan-automation-guard`, `shophuyvan-label-tracking-core-guard`, `shophuyvan-finance-core-guard`, `shophuyvan-order-core-guard`, `PROJECT-CURRENT-STATE`, `warehouse-core-map`, `core-data-map`, `marketplace-endpoint-master-checklist`, `marketplace-endpoint-progress`, `python-automation`.
- Worker/API deploy production cuối trong lượt này: `huyvan-worker-api` version `15ddf5b3-32cc-434a-a35d-60d9fc6983b1`, account `efe50fab1dd644088d681fb14a4838ae`. Static deploy cuối `shophuyvan-analytics` version `22b5d89f-5715-42cd-8998-3ebb910c5dd9`.
- TikTok status-only guard: `pull_orders`/`refresh_status` status-only không gửi/ghi field tiền và không xoá/ghi lại item; Worker `import-orders-v2` giữ nguyên finance hiện có khi `status_only=true`, Python importer strip finance/items trước khi POST. Scope `refresh_status` chỉ còn status/tracking/timeline, không còn finance/items.
- Finance taxonomy: TikTok `fee_piship` không cộng vào `total_deductions`; PiShip giữ ở cost/ship logic riêng, tránh làm lệch phí sàn và lợi nhuận.
- OMS UI production: sidebar tách 3 nút `Kéo đơn toàn bộ shop`, `Cài đặt vận hành`, `Chạy thủ công`. `Cài đặt vận hành` mở tab auto có nút lưu; `Chạy thủ công` mở tab manual riêng, ẩn nút lưu, action select gồm `refresh_status`, `retry_label`, `sync_finance`, `refresh_tracking`, `sync_detail`, `scan_all_errors`.
- `/api/jobs?ids=...` production trả đúng các job đã xong, không chỉ danh sách monitor đang chạy. UI log có thể đọc lại trạng thái cuối `completed/completed_no_change/failed`.
- Automation headful: local helper/report/chat bỏ `--headless` và bỏ `--start-minimized`; payload/log ghi `headless=false`, `interactive_desktop=true`. Đã chạy thật `pull_orders` song song TikTok job `1818` và Shopee no-API `1819`, sau đó follow-up `sync_finance` `1820`, Shopee `sync_detail` `1821`, `retry_label` `1822`; tất cả về trạng thái cuối `completed` hoặc `completed_no_change`, đúng profile automation trong `E:\shophuyvan-python-automation\profiles\browser`.
- Chat/CSKH production: thêm nút `Cài đặt` đồng bộ tin nhắn. Modal có `Đồng bộ API ngay`, `Mở helper shop không API`, `Lưu cài đặt`; API polling production chạy thật kéo `163` tin và lưu `163` tin. Helper không API hiện trả timeout từ `automation_browser.py`; UI đã sửa để không treo im lặng, có timeout và log lỗi từng nhóm helper.
- Chat order/product UI production: tab `Đơn` và `Sản phẩm` đọc Order/Product Core, hiển thị ảnh sản phẩm Shopee `320x320`, thông tin đơn, tồn, snapshot và nút `Gửi thẻ sản phẩm`. Không gửi thẻ sản phẩm live trong lượt này.
- Browser production đã mở bằng Chrome extension profile đang đăng nhập `Huy` trên domain production; không phải profile label `E:\codex-chrome-profiles\shophuyvan-test` trong tool metadata. Desktop không tràn ngang ở OMS/Chat. Chưa verify mobile/tablet bằng logged-in Chrome vì backend Chrome extension hiện không expose viewport override; in-app browser có viewport nhưng bị auth guard chuyển về login.
- Tests pass: `npm test` trong `apps/worker-api`; `node scripts/test-oms-auto-settings.mjs`; `node --check` các JS đã sửa; `python -m py_compile` các file local automation đã sửa; `git diff --check` sạch lỗi whitespace mới, chỉ còn cảnh báo line ending Windows.
- Safety: không gửi tin live trong Chat, không gửi thẻ sản phẩm live, không gọi `ship_order`, `arrange`, `confirm`, `cancel`, không chạy Payment live batch, không `taskkill chrome.exe`, không dùng profile user làm automation.

## 2026-05-23 - OMS label retry API, TikTok Product Core image/cost và timeline gọn

- Guard/docs đã đọc trước sửa: `AGENTS.md`, `shophuyvan-core-first-guard`, `shophuyvan-warehouse-core-guard`, `shophuyvan-automation-guard`, `shophuyvan-label-tracking-core-guard`, `shophuyvan-finance-core-guard`, `shophuyvan-order-core-guard`, `shopee-open-platform-docs`, `PROJECT-CURRENT-STATE`, `warehouse-core-map`, `core-data-map`, `marketplace-endpoint-master-checklist`, `marketplace-endpoint-progress`, `python-automation`.
- Deploy production bằng profile `DuAn_shophuyvan-analytics`, Cloudflare account `efe50fab1dd644088d681fb14a4838ae`: Worker cuối `huyvan-worker-api` version `cfd678a6-0936-4afa-aea2-7f0dcc7e7fc1`; Static/OMS version `1cdeba82-b950-4777-89b4-649420cd3556`.
- Shopee API label cron đổi từ `/api/label/backfill-eligible` sang `/api/label/retry-failed`, nên trạng thái `pending_document_generation`/`shopee_pdf_not_ready` đã đến hạn được tự retry lại thay vì nằm kẹt `Chờ Tem In`.
- Live retry Shopee production `POST /api/label/retry-failed` scan `3`, eligible `2`, downloaded `1`, pending retry `1`, errors `0`. Order `2605236301GU3V` readback `has_label=true`, `label_status=downloaded`, PDF `labels/2605236301GU3V.pdf`, endpoint source `shopee_open_platform:logistics.create_shipping_document>get_shipping_document_result>download_shipping_document`.
- Lazada API order `528899310088924` đang `LOGISTICS_PENDING_ARRANGE`, tracking `JNTMP0040776582VNA`; Label Core không còn báo đỏ `label_download_error` như lỗi hiện hành mà trả `label_status=not_ready`, lý do `Đơn chưa tới bước có thể tải tem.` Endpoint đã dùng vẫn là Lazada `order.package.document.get` read-only, không Chrome fallback.
- TikTok item image/cost read-model đọc thêm Product Core `products/product_variations`: order `584153607620625999` có ảnh thật `https://cf.shopee.vn/file/vn-11134207-820l4-miimbfxzfpxk2b`, vốn item `11.000 x 2 = 22.000`, order `cost_real=22.000`, lãi tạm tính `42.050`, không còn nút `Cập nhật Vốn`. Order `584152843457823885` có ảnh thật và cost source `product_core`, không còn placeholder `ẢNH`.
- OMS timeline drawer lọc các event `ORDER_CREATED` lặp khi đã có event vận chuyển thật. Browser production mở order `26052361U3W8HR` bằng profile `E:\codex-chrome-profiles\shophuyvan-test`: drawer chỉ còn `PICKED_UP`, `ORDER_CREATED` count `0`, nguồn `shopee_open_platform:/api/v2/logistics/get_tracking_info`.
- Browser production responsive bằng profile `E:\codex-chrome-profiles\shophuyvan-test` pass mobile `390x844`, tablet `820x1180`, desktop `1366x900`: không bị logout, `scrollWidth` không vượt viewport, OMS load được.
- Tests pass: `node --check apps/worker-api/src/index.js`, `node --check apps/worker-api/src/routes/orders/read-update-webhook.js`, `node --check apps/worker-api/src/core/orders/read-core.js`, `node --check apps/fe/js/modules/oms-logistics-watch.js`, `wrangler deploy --dry-run` cho Worker và frontend trước deploy.
- Safety: không gọi `ship_order`, `arrange`, `confirm`, `cancel`; không chạy Chrome fallback cho shop API; không gửi tin live; không chạy Payment live batch; không `taskkill chrome.exe`.
- Còn mở: các yêu cầu ảnh 7-13 về nút cập nhật giá khuyến mãi, chỉnh sửa giá khuyến mãi hàng loạt, Shopee API apply giá live và TikTok promotion price upload chưa xử lý trong lượt này. Cần lượt riêng vì đụng Product/Promotion write endpoint và phải verify live trên Shopee/TikTok sau khi kiểm Open Platform/permission.
## 2026-05-23 - Hotfix UI realtime/chat/giá KM sau ảnh báo lỗi

- OMS tracking drawer: frontend không còn render raw status code `RETURNED`, `RETURN_INITIATED`, `PICKED_UP` làm tiêu đề timeline. Core vẫn giữ raw `status`; UI ưu tiên `event_text/status_text/status_label_vi/description` và chỉ dùng map tiếng Việt khi thiếu text. Kiểm production bằng Chrome profile `E:\codex-chrome-profiles\shophuyvan-test`, order `260508U2FMFWJY`: drawer không còn hiện raw code, các dòng hiện tiếng Việt như `Trả hàng thành công`, `Đơn hàng đang trung chuyển`, `Đơn vị vận chuyển lấy hàng thành công`.
- Chat API shop: frontend Chat/CSKH không còn chỉ sync các conversation đã tồn tại. Nút `Đồng bộ API ngay` luôn quét các shop API chuẩn: Shopee `chihuy1984`, `chihuy2309`, `phambich2312` và Lazada `kinhdoanhonlinegiasoc@gmail.com`; endpoint đã đối chiếu theo bridge chính thức `/api/v2/sellerchat/get_conversation_list`, `/api/v2/sellerchat/get_message`, `/api/v2/sellerchat/send_message`, Lazada `/im/session/list`, `/im/message/list`, `/im/message/send`.
- Chat/CSKH production: mở `/pages/chat-cskh.html`, bấm `Cài đặt` -> `Đồng bộ API ngay`, log trả `API polling xong: kéo 0 tin, lưu 0 tin`, danh sách vẫn có 50 hội thoại và 4 chưa đọc; chứng minh nút chạy được và không còn báo không có target API.
- TikTok chat: sửa local helper `E:\shophuyvan-python-automation\oms_python\features\chat\automation_browser.py` để nhận diện sender theo class/DOM hint + tên shop/khách thay vì chỉ dựa vào vị trí bubble; frontend tạm sửa các tin TikTok cũ có nội dung kiểu `bên shop/dạ shop/shop mình` sang phía Shop để không còn lẫn khách/shop trên UI. Kiểm production hội thoại TikTok mẫu: 2 tin `Hôm qua dạ bên shop...` render class `chat-core-message shop synced`.
- OMS notification: frontend đăng ký service worker `/sw.js`, dùng `registration.showNotification()` khi có quyền Notification để chạy ổn hơn trên mobile/background; nếu Chrome chưa cấp quyền thì trạng thái vẫn `default` và trình duyệt cần người dùng cho phép notification.
- Product Master giá KM: thêm chỉnh giá hàng loạt theo phần trăm cho các SKU đã tick, chọn base `Giá KM mới đang nhập / Giá KM hiện tại / Giá gốc`; kiểm production desktop + mobile 390px + tablet 820px không tràn ngang. Bấm thử chọn SKU đầu, nhập `5%`, nút áp dụng làm input đổi và đánh dấu changed.
- Deploy frontend static `shophuyvan-analytics`: version `e9342396-63d0-49e8-afba-8669bcb10719`.
- Test pass: `node --check` các file frontend đã sửa; `python -m py_compile E:\shophuyvan-python-automation\oms_python\features\chat\automation_browser.py`.
- Còn mở/rủi ro: chưa bấm live-write Shopee Discount/TikTok promotion lên sàn trong lượt này vì cần chọn đúng `discount_id/item_id/model_id/SKU` và xác nhận admin trước khi gọi endpoint ghi thật. Backend hiện đã có Shopee Discount live guarded qua `/api/v2/discount/update_discount_item`; TikTok promotion vẫn là file/template upload trong local automation, chưa có Open Platform write-live chính thức trong hệ thống.

## 2026-05-23 - Repo cleanup Core-first mạnh tay

- Guard/skill đã dùng: `shophuyvan-warehouse-core-guard`, `shophuyvan-core-first-guard`, `shophuyvan-automation-guard`, `shophuyvan-label-tracking-core-guard`, `shophuyvan-finance-core-guard`, `shophuyvan-order-core-guard`, `shophuyvan-product-core-guard`, `shophuyvan-chat-maintenance`.
- Inventory đã chạy: `git status --short`, `git diff --stat`, `git diff --name-only`. Worktree vẫn bẩn rộng do refactor Chat/CSKH và Core mới chưa tracked; không revert các thay đổi này.
- Phân loại:
  - `CORE_KEEP`: `apps/chat-worker-api`, `apps/fe/pages/chat-cskh.html`, `apps/fe/js/dashboard/chat`, `apps/worker-api/src/core/orders/read-core.js`, `finance-taxonomy-core.js`, `tracking-core.js`, `status-automation-core.js`, `manual-sync-backfill.js`, `routes/core-data`, docs `PROJECT-CURRENT-STATE`, `warehouse-core-map`, `core-data-map`, `shop-order-product-core-plan`.
  - `DELETE_LEGACY`: `apps/fe/pages/chat-marketplace.html`, `apps/fe/js/dashboard/chat-marketplace-page.js`, `apps/fe/js/dashboard/fe-chat-marketplace/*`, `apps/worker-api/src/routes/worker-chat-marketplace/*`, `apps/worker-api/src/core/chat/*`, `apps/fe/js/modules/handler-shopee.js`, `scripts/check-order-chat-resolver-cdp.mjs`, `scripts/check-tiktok-chat-dedupe-cdp.mjs`, `project_tree_full.txt`, root file rác `gitignore`, `scripts/__pycache__`.
  - `ARCHIVE_DOCS`: chuyển các audit/plan cũ vào `docs/archive/`: `chat-legacy-cleanup.md`, `LEGACY-CLEANUP-AUDIT.md`, `refactor-file-map.md`, `ui-responsive-audit.md`, `sql-optimization-report.md`, `data-cleanup-report.md`, `database-cleanup-plan.md`, `d1-data-hygiene-audit.md`.
  - `REBUILD_FROM_CORE`: Chat legacy đã thay bằng `chat-cskh.html` + Chat Worker riêng; Worker chính `/api/chat/*` giữ guard 410; Shopee bridge giữ ở `routes/marketplace-chat/*` để Chat Worker gọi API chính thức; OMS manual sync đi `/api/orders/manual-sync/backfill`.
  - `DO_NOT_TOUCH_DATA`: D1 production, R2/storage, migrations/schema thật, `profiles.local.json`, Chrome profiles, runtime `E:\shophuyvan-runtime`, automation code/runtime đang dùng thật.
- Caller search: `rg` runtime cho `chat-marketplace`, `fe-chat-marketplace`, `worker-chat-marketplace`, `core/chat`, `handler-shopee`, script CDP cũ chỉ còn hit docs lịch sử hoặc test guard; runtime đang dùng `chat-cskh.html`, Chat Worker, Core API và bridge mới.
- Xoá/di chuyển đã làm: xoá `project_tree_full.txt`, xoá root `gitignore`, xoá `scripts/__pycache__`, chuyển docs audit/plan cũ vào `docs/archive`. Giữ deletion legacy Chat đã có sẵn, không restore.
- Test pass sau cleanup: `npm test`, `npm run lint --if-present`, `npm run build --if-present` trong `apps/worker-api`; `npm run lint --if-present`, `npm run build --if-present` trong `apps/fe`; `npm test` trong `apps/chat-worker-api`; `node scripts/check-oms-core-regression-lock.mjs`; `python -m py_compile` các Python còn trong repo; `git diff --check` exit 0, chỉ còn cảnh báo CRLF Windows.
- Production smoke bằng Chrome đang đăng nhập: OMS dashboard, Product Master, ADS/Promotion, Chat/CSKH đều mở được, không rơi login, không có text/asset legacy `chat-marketplace` hoặc `fe-chat-marketplace`; OMS modal `Cài đặt vận hành` mở được, tab `Chạy thủ công` có `pull_orders`, `refresh_status`, `retry_label`, `sync_finance`, `refresh_tracking`, `sync_detail`, `scan_all_errors`, các nút preview/run/refresh/copy log.
- Automation check: helper local `/health` đang chạy Radar PID `11340`; job `2371` TikTok `pull_orders`, `2373` Shopee `pull_orders`, `2375` TikTok `refresh_status`, `2396` Shopee `refresh_status`, `2368` TikTok `retry_label`, `2370` Shopee `retry_label` có trạng thái cuối và log `headless=false`, đúng profile automation. Job `2369` TikTok `sync_finance` vẫn `queued` sau wake, chưa được tính pass; cần xử lý queue/backlog riêng hoặc đợi scheduler finance pick tới giờ tiếp theo.

## 2026-05-23 - Product Master Promotion Core Shopee Discount live-write

- Guard/docs đã đọc trước sửa: `AGENTS.md`, `shophuyvan-core-first-guard`, `shophuyvan-warehouse-core-guard`, `shophuyvan-automation-guard`, `shophuyvan-label-tracking-core-guard`, `shophuyvan-finance-core-guard`, `shophuyvan-order-core-guard`, `shophuyvan-product-core-guard`, `shopee-open-platform-docs`, `PROJECT-CURRENT-STATE`, `warehouse-core-map`, `core-data-map`, `marketplace-endpoint-master-checklist`, `marketplace-endpoint-progress`, `python-automation`.
- Product Master price-promotion preview now reads Shopee Discount Core from `marketplace_discount_items` before legacy `marketplace_promotion_items`.
- Allowlist added for Shopee Discount live write: `/api/v2/discount/update_discount_item` with admin confirm, dry-run/readback requirement, and scoped env guard `SHOPEE_DISCOUNT_LIVE_WRITE_ENABLED=true`.
- Shopee Discount sync checked on production:
  - `chihuy1984`: `/api/v2/discount/get_discount_list` + `/api/v2/discount/get_discount`, saved 1 discount and 179 items.
  - `phambich2312`: `/api/v2/discount/get_discount_list` + `/api/v2/discount/get_discount`, saved 1 discount and 138 items.
- SKU production sample `400348_100_day_dai_100mm` on shop `chihuy1984`:
  - Preview resolved `discount_id=799049801465856`, `item_id=11708283596`, `model_id=258985454594`, mapping source `marketplace_discount_items`.
  - UI no longer shows `Tồn đề xuất` in the promotion price flow; `proposed_stock` is absent from the preview row.
  - First live attempt at `15.000đ` reached Shopee but Shopee rejected it with `discount.promotion_price_higher_input_price`; Core stored failed write status.
  - Live sample at `10.000đ` succeeded: Shopee response `count=1`, request `e3e3e7f3527ae21428b6862e71575300`, readback verified, `write_status=success`, `promotion_sync_status=synced`.
  - Reverted by the same flow to `9.900đ`; final production readback shows `current_promotion_price=9900`, `status=no_change`, `write_status=success`, `last_write_at=2026-05-23 19:01:07`, `last_readback_at=2026-05-23 19:01:07`.
- Worker deploy versions:
  - `ed4a12c7-19c9-443a-aa3e-7a74d497b68d`: initial Discount Core/preview/live route deploy.
  - `29dfcfa7-6d0a-48d2-9524-ff4d8e9287f3`: scoped Shopee Discount live-write env enabled.
  - `601e5b7f-0f08-49dc-9628-e30a717ad785`: Shopee uint64 payload fix.
  - `944d4e6b-4f95-4eae-b9e5-128971d55f28`: final no-change summary fix.
- Static deploy version `0f7ab308-659d-4b84-beb2-a570bdda8feb` includes Product Master live-write UI button.
- Tests pass: `npm test` in `apps/worker-api`, worker lint/build, FE lint/build, `node scripts/check-oms-core-regression-lock.mjs`, `git diff --check`.
- Safety: no stock write in promotion price flow, no Seller Center fallback for Shopee API shops, no `ship_order`, `arrange`, `confirm`, `cancel`, no payment live batch, no hard-coded token.

## 2026-05-23 - Promotion Core API live-write Shopee/Lazada và UI readback

- Guard/docs đã đọc hoặc dùng trong lượt: `AGENTS.md`, `shophuyvan-core-first-guard`, `shophuyvan-warehouse-core-guard`, `shophuyvan-automation-guard`, `shophuyvan-label-tracking-core-guard`, `shophuyvan-finance-core-guard`, `shophuyvan-order-core-guard`, `shophuyvan-product-core-guard`, `PROJECT-CURRENT-STATE`, `warehouse-core-map`, `core-data-map`, `marketplace-endpoint-master-checklist`, `marketplace-endpoint-progress`, `python-automation`.
- Worker production cuối: `huyvan-worker-api` version `ef3dfe60-b13e-4914-b46a-8716c89137b1`, Cloudflare account `efe50fab1dd644088d681fb14a4838ae`. Static production đã deploy ở lượt này trước đó: `shophuyvan-analytics` version `111bee39-5de3-4609-a02c-d289c449ee62`.
- Endpoint official đã kiểm/đã dùng:
  - Shopee: `/api/v2/discount/update_discount_item`; readback `/api/v2/discount/get_discount`.
  - Lazada: `/product/price_quantity/update`; readback `/products/get`. Lazada không dùng `SellerSku` cho live-write vì API trả `SellerSku parameter is no longer supported`; route hiện resolve `SkuId` rồi gửi XML form `SkuId + SalePrice`.
- Shopee variation mismatch đã sửa trong preview Core: không fallback mù theo `item_id`; exact SKU/model hoặc `item_id + variation_name`. Production preview `40TACKE6X32MMK243` trả đúng `model_id=370230821235`, không lệch sang `40TACKE5X30MM`.
- Shopee live-write verified bằng Chrome visible profile `E:\codex-chrome-profiles\shophuyvan-test`: shop `chihuy1984`, SKU `400348_100_day_dai_100mm`, giá `9.900đ`, request `e3e3e7f3527d2e5c33bdcb8dc0da9100`, `verified=true`, `write_status=success`, `promotion_sync_status=synced`.
- Shopee Core/UI readback: route live-write cập nhật `marketplace_discount_items` và `product_variations.discount_price`; `/api/sync-variations` trả SKU mẫu `discount_price=9900`, Product Master UI reload row hiện `Giá KM hiện tại=9.900đ`, preview no-change với current/target `9900`.
- Lazada live-write verified: shop `kinhdoanhonlinegiasoc@gmail.com`, SKU `BANGDINH_K205`, `SkuId=10096365942`, `ItemId=2145625144`, `SalePrice=14000`, request `21013cf717795464481103268`, `/products/get` readback `special_price=14000`, Core `discount_price=14000`, preview no-change.
- Product Master UI production:
  - Nút `Đồng bộ giá KM từ sàn` xuất hiện trên tab Giá khuyến mãi.
  - Bấm thật Shopee API `phambich2312` sync Discount Core xong và bảng load lại `129` SKU. Sau fix read-model `/api/sync-variations?platform=shopee&shop=phambich2312&include_out_of_stock=0` trả `129/129` dòng có `discount_price`; Product Master production render `120/120` dòng đầu có giá KM, không còn toàn `Chưa có`.
  - Shopee API `chihuy2309` sync Discount Core production qua Worker trả `status=ok`, `ok_count=1`, `total_items=178`, `errors=0`.
  - Bấm thật Lazada API `kinhdoanhonlinegiasoc@gmail.com` sync products xong `159` SKU và bảng load lại `156` SKU còn tồn.
  - Responsive pass desktop `1366x900`, tablet `820x1180`, mobile `390x844`: không tràn ngang, nút sync visible, bảng load `120` input.
- Python automation update: `E:\shophuyvan-python-automation\oms_python\ui\tabs\auto_run_tab.py` nhận `task_type=promotion_prices`, bắt buộc `headless=false`, `requires_visible_browser=true`, route Shopee promotion qua `shopee_promo.py`. `shopee_promo.py` parse report tải từ Seller Center; partial chỉ gồm dòng `Hết hàng` được ghi `completed`, còn lỗi khác vẫn ghi `failed`.
- Tests pass: `npm test` trong `apps/worker-api`; `node --check` các route JS đã sửa; `python -m py_compile E:\shophuyvan-python-automation\oms_python\ui\tabs\auto_run_tab.py E:\shophuyvan-python-automation\oms_python\platforms\shopee\promotion\shopee_promo.py E:\shophuyvan-python-automation\oms_python\features\reports\run_report_jobs.py`.
- Còn mở/ghi chú sau live-write:
  - Shopee no-API `khogiadungcona`: upload file đã chạy lại bằng job `2715`; Seller Center trả `114/131`, report `E:\shophuyvan-runtime\downloads\shopee_khogiadungcona_promo_upload_report_20260524_064325.xlsx` có 114 dòng thành công, 17 dòng `Hết hàng`, 0 lỗi khác. Kết quả này được tính completed theo rule mới vì thất bại do hết hàng là đúng; UI Product Master hiển thị badge từng dòng `Đã up sàn` / `Hết hàng`.
  - TikTok no-API `0909128999`: scrape/readback giá KM đã có từ trước, nhưng upload giá KM lên Seller Center chưa nối xong vào Auto-run tab và chưa có live verification.
  - Dữ liệu tiếng Việt một số API/read-model cũ vẫn có mojibake trong DB response; không sửa trong lượt này vì ngoài scope live-write endpoint.

## 2026-05-25 - Chat/CSKH realtime, no-API helper và UI gọn

- UI Chat mới gọn hơn: tiêu đề và badge dùng ngôn ngữ vận hành (`Tin mới`, `Kết nối chính thức`, `Trình duyệt hỗ trợ`, `Gửi tay`), giảm chiều cao topbar/list/thread, giữ mobile-first và không hiển thị module kỹ thuật ở màn chính.
- Realtime shop API: frontend poll từng shop API theo `poll_seconds=12`, luôn có target Shopee `chihuy1984/chihuy2309/phambich2312` và Lazada `kinhdoanhonlinegiasoc@gmail.com`; sau sync tự reload conversation list và thread đang mở.
- Endpoint chính thức đã dùng/kiểm: Shopee SellerChat `/api/v2/sellerchat/get_conversation_list`, `/api/v2/sellerchat/get_message`, `/api/v2/sellerchat/send_message`; Lazada IM `/im/session/list`, `/im/message/list`, `/im/message/send`. Không phát sinh endpoint thiếu.
- Shop không API: frontend chỉ gọi helper exact target `khogiadungcona` và TikTok `0909128999`; local helper `automation_browser.py` chặn shop API không được mở Chrome helper dù request web gửi filter rộng. Chrome visible/headful đúng profile automation, không headless.
- Encoding: sửa mojibake trong `automation_browser.py`; Chat Worker sửa mojibake trước khi ghi/đọc Chat Core; FE có lớp hiển thị an toàn cho dữ liệu cũ. Production UI không còn hiện chuỗi tiếng Việt lỗi encoding ở hội thoại cũ.
- Production deploy: static `shophuyvan-analytics` version cuối `2f2119a7-5dde-4583-9885-6a444d6b8096`; Chat Worker riêng `shophuyvan-chat-api` version `378b2d46-ae15-4057-a4ef-f7a38dcf9c63`. Không deploy Worker chính.
- Production verification bằng Chrome profile `E:\codex-chrome-profiles\shophuyvan-test`: mobile `390x844`, tablet `820x1180`, desktop `1366x900`; 50 hội thoại, 4 chưa đọc, mở thread được, `Tin mới` chạy xong, modal cài đặt mở được, không tràn ngang. Screenshots: `artifacts/chat-cskh-20260525/mobile.png`, `tablet.png`, `desktop.png`.
- Helper verification: Shopee no-API exact `khogiadungcona` chạy `ok`, `shops_checked=1`, `status=no_messages`, đúng profile/port `9319`, không mở nhầm shop API. TikTok no-API `0909128999` chạy `ok`, `accepted_messages=1`, `saved_messages=1` lần đầu, lần bấm từ UI `skipped_duplicates=1`, `last_synced_at=2026-05-25T12:05:07.162Z`.
- Chat readback: shop API Shopee có hội thoại chứa cả `sender_type=customer` và `sender_type=shop`; no-API Shopee/TikTok nhận được tin khách, Shopee no-API cũ có cả phản hồi shop. UI hiển thị tin khách và tin shop đúng dấu.
## 2026-05-25 - Chat/CSKH hotfix sau phản hồi vẫn chỉ thấy tin 22/05

- Nguyên nhân chính: UI Chat/CSKH mặc định lọc `Shopee`, nên các thread TikTok mới hơn bị ẩn; nút `Tin mới` ngoài màn hình chỉ kéo một target API đầu tiên, chưa chạy đầy đủ shop API + helper no-API.
- Đã sửa UI mặc định `Tất cả kênh`; danh sách production mở đầu bằng TikTok `0909128999` với thread ngày `25/05` thay vì Shopee cũ `22/05`.
- Đã sửa nút `Tin mới`: bấm một lần gọi tất cả shop API chính thức rồi gọi local helper cho Shopee no-API `khogiadungcona` và TikTok no-API `0909128999`.
- TikTok helper từ UI đã chuyển sang `browser_thread_detail`, viewport `1380x860`, Chrome visible/headful, để đọc được thread thật và phân biệt `customer`/`shop`; không chỉ đọc preview.
- Chat Worker deploy `f270d3aa-3328-495a-8e59-283766956818`; static UI deploy cuối `444654ae-397c-4578-856c-0f792478dc7e`; không deploy Worker chính.
- Production readback sau khi bấm UI: `conv_tiktok_0909128999_automation_tiktok_d4bb45d4096080de` có `sender_types=["customer","shop"]`, `last_synced_at=2026-05-25T15:42:57.326Z`, `last_message_at=2026-05-25T22:42:33+07:00`; có tin khách và phản hồi shop trong cùng thread.
- Shop API readback: Shopee `chihuy1984/chihuy2309/phambich2312` gọi `/api/v2/sellerchat/get_conversation_list` quét `30` hội thoại mỗi shop, `skipped_unchanged=30`, không có message mới so với timestamp Core; Lazada `kinhdoanhonlinegiasoc@gmail.com` gọi `/im/session/list` quét `20`, `skipped_unchanged=20`.
- Shopee no-API `khogiadungcona`: profile thật `HuyVan_Bot_Data_khogiadungcona` mở `new-webchat/conversations` nhưng Shopee hiển thị `Không Tìm Thấy Cuộc Hội Thoại Nào`; helper trả `status=no_messages`, không fake dữ liệu.
- Screenshot production sau hotfix: `artifacts/chat-cskh-20260525/realtime-all-default.png`.

## 2026-05-26 - Khuyến mãi sàn gọn màn vận hành và ẩn chương trình hết hiệu lực

- Đã xoá khỏi UI Khuyến mãi sàn các mục gây rối được đánh dấu: `Tổng quan khuyến mãi`, `Đồng bộ khuyến mãi`, `Nhật ký thao tác khuyến mãi`, `Cài đặt khuyến mãi`; code render/caller tương ứng trong `apps/fe/js/dashboard/promotions.js` đã dọn.
- Bộ lọc chính chuyển sang `Đang hiệu lực`; không còn option `Đã kết thúc` ở danh sách vận hành.
- Promotion module read-model mặc định dùng `not_expired`, loại trạng thái `expired/ended/finish/finished/deleted/end` và bản ghi có `end_time` đã qua. Chương trình/voucher/Flash Sale hết hiệu lực chỉ còn xuất hiện trong màn `Dọn chương trình cũ`.
- Test local đã pass: `node --check` các file JS sửa, `node scripts/test-ads-operations-ui.mjs`, `node scripts/test-ui-design-system-guard.mjs`, `npm --prefix apps/fe run lint --if-present`, `npm --prefix apps/fe run build --if-present`, `npm --prefix apps/worker-api test --if-present`, `git diff --check` trong phạm vi file sửa.
- Production deploy: Worker `huyvan-worker-api` version `2fca6e28-b4c0-4b6e-9c7c-ac151ac5d217`; static `shophuyvan-analytics` version `fef60f27-6ae1-42f6-a809-7fe69eb8c2d3`.
- Production verification bằng Chrome profile `E:\codex-chrome-profiles\shophuyvan-test`: desktop `1366x900`, tablet `820x1180`, mobile `390x844` không login wall, không tràn ngang; chip còn lại chỉ gồm `Dọn chương trình cũ` và 8 module sàn; Shopee Flash Sale gọi read-model `status=not_expired` và không thấy dòng expired/ended/đã kết thúc. Evidence: `tmp-verification/promotion-clean-production-check.json`.

## 2026-05-26 - Shopee promotion modules chỉ còn Tạo chương trình

- Trong `Shopee Voucher`, `Shopee Bundle`, `Shopee Add-On`, `Shopee Flash Sale`, toolbar chỉ còn nút `Tạo chương trình`; đã bỏ render `Làm mới` và `Đồng bộ từ sàn`.
- Code liên quan đã dọn/chặn: thêm `CREATE_ONLY_MODULE_KEYS`, `moduleToolbar()` chỉ render create-only cho 4 module trên, và `syncPromotionModule()` trả về sớm nếu caller cũ gọi nhầm các module này.
- Static deploy `shophuyvan-analytics` version `96aac98e-8144-4b92-a5b5-1a8b1110807c`.
- Production verification bằng Chrome profile `E:\codex-chrome-profiles\shophuyvan-test`: desktop `1366x900`, tablet `820x1180`, mobile `390x844`, cả 4 module đều chỉ có một button `Tạo chương trình`, không còn `loadPromotionModule`/`syncPromotionModule` trong toolbar, không tràn ngang. Evidence: `tmp-verification/promotion-create-only-production-check.json`.
- Test trực tiếp pass: `node --check apps\fe\js\dashboard\promotions.js`, `node --check scripts\test-ads-operations-ui.mjs`, `node scripts\test-ui-design-system-guard.mjs`, promotion create-only static guard, FE lint/build. `node scripts\test-ads-operations-ui.mjs` đang fail ở phần ADS `Campaign không hiệu quả`, không thuộc code Khuyến mãi lượt này.

## 2026-05-26 - Ẩn bảng SKU cũ trong module Shopee Promotion

- Với `Shopee Voucher`, `Shopee Bundle`, `Shopee Add-On`, `Shopee Flash Sale`, UI không render khối `Danh sách SKU/sản phẩm áp dụng` nữa để tránh hiện chương trình/item cũ.
- Backend `promotion-module-read-model` đã đổi query item của `marketplace_promotion_items` sang `INNER JOIN marketplace_promotion_programs p` và áp filter trạng thái/thời gian trên chương trình cha; item mồ côi hoặc thuộc chương trình đã hết hiệu lực không còn được trả về danh sách vận hành.
- Deploy production: Worker `huyvan-worker-api` version `b316c48a-9698-43b4-97ab-cc404660ad84`; static `shophuyvan-analytics` version `6543503a-a13d-4a58-8cb1-ad02d47765fa`.
- Production verification bằng Chrome profile `E:\codex-chrome-profiles\shophuyvan-test`: desktop `1366x900`, tablet `820x1180`, mobile `390x844`; cả 4 module trên không còn text/khối `Danh sách SKU/sản phẩm áp dụng`, toolbar chỉ còn `Tạo chương trình`, không tràn ngang. Evidence: `tmp-verification/promotion-hide-old-items-production-check.json`.

## 2026-05-26 - Shopee Flash Sale automation shop-scope và time slot endpoint

- Sửa UI Flash Sale theo phản hồi vận hành: nhập giá/số lượng, tìm SKU và chọn checkbox không còn kéo trang nhảy lên; sản phẩm mới đang set hiển thị `Chờ chạy theo luật`, không gắn nhầm `Đang chạy`.
- Với module `Shopee Flash Sale`, UI không render bảng dưới `Danh sách sản phẩm/SKU`; product picker ngay trong khung giờ là nơi tìm và chọn sản phẩm.
- Flash Sale automation bắt buộc chọn shop ở bộ lọc. Khi đang ở `Tất cả shop`, `activeShop` rỗng và các nút bật/tắt, thêm khung giờ, lưu luật, chạy ngay, tắt khẩn cấp, kiểm tra khung giờ và picker đều bị khóa. Dropdown giữ đủ shop đã biết để đổi trực tiếp giữa `chihuy1984`, `chihuy2309`, `phambich2312`, `kinhdoanhonlinegiasoc@gmail.com`.
- Settings Flash Sale lưu theo shop bằng key `flash_auto:${shop}`; payload automation luôn kèm `flash_auto.shop`. Không có chế độ chạy Flash Sale cho toàn bộ shop vì item/model/SKU và time slot là dữ liệu riêng từng shop.
- Đã nối route read-only `/api/discounts/shopee/flash-sale/time-slots` vào endpoint Shopee chính thức `/api/v2/shop_flash_sale/get_time_slot_id` với `shop`, `start_time`, `end_time`; UI hiển thị `Khung giờ sàn #...` khi readback khớp.
- Deploy production: Worker `huyvan-worker-api` version `9b5135c4-6a8a-4c30-be3e-fcd4120fd3cc`; static `shophuyvan-analytics` version `42478bc5-c8a1-41f7-99cf-fd38cd0201b3`.
- Production verification bằng Chrome profile `E:\codex-chrome-profiles\shophuyvan-test`: desktop `1366x900`, tablet `820x1180`, mobile `390x844` đều `overflowX=0`; script cache `promotions-20260526g`; `chihuy1984` picker có `120` sản phẩm và chỉ có shop `chihuy1984`; scroll giữ nguyên `957` sau mở picker, lọc `K242`, chọn sản phẩm, nhập giá `47000`, nhập số lượng `7`, kiểm tra time slot; readback time slot `273882997665795`, trạng thái `Đã khớp khung giờ sàn`. Screenshots: `artifacts/promotions-20260526g-shop-flash-final/`.
- Không bấm `Chạy ngay` và không gửi live-write Flash Sale trong lượt này; phần vừa nối là đọc time slot chính thức và guard theo shop.
### 2026-05-26 - Chat Core deploy/production verification

- Deploy Chat Worker riêng `shophuyvan-chat-api` bằng profile `shophuyvan-chat-api`, Cloudflare account `39cf0fe9b3eda88bda53e369770cabeb`, version cuối `e305fbca-38ca-4e54-b55c-e5872d37a2b3`, URL `https://shophuyvan-chat-api.zacha030596.workers.dev`, cron `*/2 * * * *`.
- Secret production đã set: `BROWSER_HELPER_SECRET`, `SHOPEE_WEBHOOK_SECRET`, `LAZADA_WEBHOOK_SECRET`; `SHOPEE_CHAT_BRIDGE_SECRET` giữ nguyên. Secret local cho helper nằm ngoài repo chính tại `E:\shophuyvan-python-automation\data\config\browser_helper.local.json`.
- Production API verification pass: `/api/chat/health` trả D1 mode; browser-helper thiếu token trả `401 browser_helper_auth_failed`; browser-helper push có token lưu message; WebSocket `/api/chat/realtime/connect` nhận broadcast message mới; webhook Shopee HMAC sai trả `401 webhook_auth_failed`, HMAC đúng trả `200 processed=1`.
- Đã xoá dữ liệu smoke test `codex_*` khỏi D1 production sau kiểm bằng `DELETE FROM chat_messages/chat_conversations/chat_sync_state WHERE shop_id LIKE 'codex_%'`.
- Production UI verification pass: mở `https://shophuyvan-analytics.nghiemchihuy.workers.dev/pages/chat-cskh`, không console error, không còn dữ liệu smoke test; responsive desktop `1366x900`, tablet `820x1180`, mobile `390x844` đều không tràn ngang.

### 2026-05-26 - Chat Core realtime/webhook/browser-helper

- Đã đọc guard/docs bắt buộc trước khi sửa Chat Core. `shophuyvan-ui-ux-master-skill` không tồn tại trong local/repo skills nên không áp dụng được; các UI guard còn lại đã đọc.
- Chat Worker `apps/chat-worker-api` thêm inbound realtime cho shop có API: `POST /api/chat/webhook/:channel` với HMAC SHA-256 bắt buộc cho Shopee (`X-Shopee-Signature` + `SHOPEE_WEBHOOK_SECRET`) và Lazada (`X-Lazada-Hmac-Sha256` + `LAZADA_WEBHOOK_SECRET`). Adapter Shopee/Lazada có `normalizeWebhookPayload`, ghi về Chat Core qua `mergeMessageIntoStore`, chỉ broadcast khi message mới.
- Realtime thêm Durable Object `ChatRealtimeRoom`, binding `CHAT_REALTIME`, endpoint `GET /api/chat/realtime/connect?shop_id=...`, broadcast nội bộ qua Durable Object và heartbeat 30 giây. Cron Chat Worker chạy mỗi 2 phút, gọi `scheduledSync` để polling fallback các hội thoại `polling_api/webhook` bị stale trên 5 phút.
- Shop không API chuyển sang endpoint chuẩn `POST /api/chat/browser-helper/push` và `GET /api/chat/browser-helper/poll`; token bắt buộc `X-Helper-Token` khớp `BROWSER_HELPER_SECRET` tối thiểu 32 ký tự. Route cũ `/api/chat/automation-ingest` đã xoá hẳn, không wrapper mỏng, không 410; hai caller Python thật trong `E:\shophuyvan-python-automation\oms_python\features\chat` đã chuyển sang endpoint mới.
- Python helper skeleton đặt đúng vùng automation ngoài repo chính: `E:\shophuyvan-python-automation\oms_python\features\chat_helper\` gồm `tiktok_helper.py`, `scraper.py`, `pusher.py`, `config.py`, `config.example.yml`, `requirements.txt`; dùng Playwright async, httpx, pyyaml, retry/backoff, log `chat_helper.log`.
- Chat Core thêm `sync_health` cho conversation (`ok/stale/critical/unknown`) và `getConversationSyncDiagnostic`; capability core thêm `diagnoseCapabilityIssue` cho các case `webhook_stale`, `polling_error`, `browser_helper_not_running`, `manual_no_messages`.
- Test local pass: `npm --prefix apps/chat-worker-api test`, `python -m py_compile` cho caller Python và helper mới, smoke route local bằng Node cho browser-helper push + Shopee webhook HMAC + conversation list có `sync_health`.
- Chưa deploy production Chat Worker trong mục này nếu chưa có secret production `BROWSER_HELPER_SECRET`, `SHOPEE_WEBHOOK_SECRET`, `LAZADA_WEBHOOK_SECRET` và xác nhận Cloudflare profile `shophuyvan-chat-api`.

### 2026-05-26 - Chat/CSKH Operational Dark UI thay toàn bộ màn cũ

- Đã thay trực tiếp runtime đang được production load tại `apps/fe/pages/chat-cskh.html`, `apps/fe/css/dashboard/chat.css`, `apps/fe/js/dashboard/chat/*`; không tạo React/Vite runtime thứ hai vì static Worker assets hiện đang load page này trực tiếp.
- Đã xoá các module chat cũ trong `apps/fe/js/dashboard/chat/` rồi dựng lại theo UI mới: 3 cột Operational Dark, conversation list virtualized, health dot, thread realtime, composer optimistic/manual draft, detail 3 tab, sync status bar, toast/modal, mobile-first.
- Đã sửa hook realtime để không tự hiện banner offline do close-event cũ khi mở lại cùng shop trong lúc socket đang kết nối. WebSocket production readback mở được `wss://shophuyvan-chat-api.zacha030596.workers.dev/api/chat/realtime/connect?shop_id=0909128999` và trả `connected`.
- Deploy static `shophuyvan-analytics` bằng đúng account `efe50fab1dd644088d681fb14a4838ae`; version cuối `3f82e8e9-8ae3-4a2f-ad44-e8de70bfad93`. Không deploy Worker chính trong phần UI này; Chat Worker giữ version `e305fbca-38ca-4e54-b55c-e5872d37a2b3`.
- Verification local: `node --check` toàn bộ module chat và `scripts/check-chat-core-browser.mjs`; local responsive mobile `390x844`, tablet `820x1180`, desktop `1366x900` pass shell mới, không shell cũ, không tràn ngang, optimistic send hiển thị ngay rồi chuyển lỗi local có nút thử lại khi adapter local không cấu hình.
- Verification production: `node scripts/check-chat-core-browser.mjs` với URL `https://shophuyvan-analytics.nghiemchihuy.workers.dev/pages/chat-cskh.html?rt-check=2`, Chrome profile `E:\codex-chrome-profiles\shophuyvan-test`; mobile/tablet/desktop pass, `hasNewShell=true`, `hasOldShell=false`, `overflowX=false`, `consoleErrors=[]`, `httpErrors=[]`, `realtimeBannerHidden=true`.
- Dữ liệu test production: script đã tạo 3 draft test manual trong thread TikTok để kiểm thao tác thật; đã xoá khỏi `chat_messages` và restore `chat_conversations.last_message_text` về `Trạng thái Đã giao`. Readback D1 còn `0` row `text LIKE 'Kiểm tra UI mới%'`.
- Còn mở: các shop TikTok/manual vẫn cần browser helper chạy thật để `sync_health` hết critical; UI hiện đúng hướng dẫn helper thay vì giả lập API.
### 2026-05-26 - Chat Core Overhaul Shopee sync + UI theo bằng chứng video

- Đã xem bằng chứng mobile Shopee Chat: danh sách cần hiển thị `tên khách | tên shop`, preview `[Emoji]/[Hình ảnh]`, thời gian/unread; thread cần có shortcut `Trả lời nhanh`, `Đơn hàng`, `Sản phẩm`, `Voucher`.
- Worker chính `huyvan-worker-api` sửa Shopee SellerChat bridge: preview message type chuẩn hơn, enrich metadata recent bằng `get_one_conversation` có giới hạn, fallback tên khách từ Order Core/D1 theo `buyer_id` khi SellerChat không trả tên, và chặn seed conversation rỗng khi `get_one_conversation/get_message` trả `param_error`.
- Đã dọn đúng 1 row rỗng production trong Chat D1: `id='shopee_170044686_643004115309475342'`, `customer_id=''`, `customer_name=''`, `last_message_text=''`; không xoá hội thoại thật khác.
- UI `apps/fe/pages/chat-cskh.html` + `apps/fe/js/dashboard/chat/*` thêm panel Core-first: `Đơn`, `Sản phẩm`, `Voucher`, `Trả lời nhanh`; composer có shortcut giống app. Tab Đơn/Sản phẩm chỉ đọc `/api/core/orders/by-conversation/*` và `/api/core/products/search`, không tự tính nghiệp vụ trong frontend. Product card chỉ kiểm tra bằng dry-run trong lần verify, không gửi live cho khách.
- Deploy production: Worker chính `huyvan-worker-api` version cuối `30cc9940-73eb-4fdf-82e5-c696e1810cc6`; static `shophuyvan-analytics` version `b5ee14e6-d2a2-4e2f-a960-5d3a0fc7eab0`; Chat Worker không đổi.
- Production API verification: `POST /api/chat/sync` Shopee shop `170044686` với `limit=10`, `force_history=true` trả `200`, `pulled_conversations=10`, `pulled_messages=14`, `saved_messages=0`, không còn lỗi `Too many subrequests`. UI production top Shopee còn `tdminh82 | GIA DỤNG HUY VÂN`, có tin `DẠ` ngày `26/05/2026`.
- Production UI verification bằng Chrome profile `E:\codex-chrome-profiles\shophuyvan-test`: mobile `390x844`, tablet `820x1180`, desktop `1366x900` pass, `consoleErrors=[]`, `httpErrors=[]`, `overflowX=false`. Panel `Đơn` có 1 order card, `Sản phẩm` có 6 card từ Product Core, `Voucher` báo không có voucher đang chạy, `Trả lời nhanh` chèn được text vào composer. Dry-run thẻ sản phẩm SKU `BOMACHPROK242+PIN` trả `dry_run=true`, adapter OK.
- Còn mở quan trọng: các khách trong bằng chứng video như `kalot4991`, `phamdatthao273`, `anhvunhi1995`, `tiendatfarm` hiện không xuất hiện qua SellerChat API production; Open Platform/SellerChat list có row thiếu metadata hoặc chỉ trả lịch sử cũ. Cần phase tiếp theo nối browser-helper Shopee/Seller Center để scrape inbox summary cho các row API thiếu tên/preview, sau đó ghi vào Chat Core bằng endpoint helper chuẩn; không được coi là đã hoàn tất parity với app Shopee cho phần này.
### 2026-05-26 - Chat/CSKH Duoke order/product panels + Lazada IM readback

- Đã sửa Chat/CSKH theo Core-first: UI tab `Đơn` chỉ render Order Core từ `/api/core/orders/by-conversation/*`; tab `Sản phẩm` chỉ render Product Core/search và sản phẩm suy ra từ item đơn. Không thêm tính nghiệp vụ vào frontend.
- Tab `Đơn` production đã hiển thị theo hướng Duoke: trạng thái, mã đơn, thời gian, ảnh sản phẩm, phân loại, SKU, giá, số lượng, số tiền thanh toán, phương thức thanh toán, thời gian thanh toán, đơn vị vận chuyển, thời gian hoàn thành, ghi chú người mua/người bán/OMS và nút `Hóa đơn`, `Chi tiết`, `Gửi`.
- Tab `Sản phẩm` production có thanh lọc/tìm kiếm/làm mới/sắp xếp, card ảnh sản phẩm, tên, SKU, giá, nhãn `Recent inquiries`, tồn nếu Core có dữ liệu, nút kiểm tra và nút `Gửi`. Dữ liệu tồn thiếu không còn hiện `[object Object]` hoặc `Tồn Chưa rõ tồn`.
- Chat Core sửa chuẩn hóa dữ liệu bẩn: object message không còn lưu/đọc thành `[object Object]`; Lazada adapter trả thêm `customer_name` từ `buyer_name/user_name/nickname/display_name`.
- Thông báo điện thoại/trình duyệt: UI thêm nút `Bật thông báo`, service worker được đăng ký, polling/realtime khi thấy tin khách mới sẽ gọi `showNotification` nếu browser đã cấp quyền. Production Chrome profile hiện đang `Notification.permission=denied`, nên không thể hiện OS notification trên profile đó cho tới khi mở lại quyền trong site settings.
- Lazada API đã sửa bridge `/im/message/list` để truyền `start_time` bắt buộc. Production readback sau deploy: `POST /api/chat/sync` với `channel=lazada`, `shop_id=200166591213`, `limit=5`, `page_size=5` trả `pulled_conversations=5`, `pulled_messages=12`, `saved_messages=12`; attempts `/im/session/list` và `/im/message/list` đều HTTP 200, Lazada code `0`.
- Deploy production: static `shophuyvan-analytics` version cuối `95942c14-061e-4094-bf21-dac0c08eeaf0`; Chat Worker `shophuyvan-chat-api` version cuối `942cce27-86aa-428b-86e9-ef0e2aba352d`; Worker chính `huyvan-worker-api` version cuối `88939f12-78bf-4f89-a891-55e6f4483b23`.
- Production UI verification bằng Chrome profile `E:\codex-chrome-profiles\shophuyvan-test`: mở `phuonganh160102`, desktop `1440x900`, tablet `820x1180`, mobile `390x844` không tràn ngang; order card có 1 ảnh/item; product panel có 3 card/3 ảnh; không còn tab `Khách`; không còn `[object Object]` trên body.
- Test pass: `node --check` cho các file Chat/bridge sửa, `node scripts/test-ui-design-system-guard.mjs`, `node scripts/check-oms-core-regression-lock.mjs`, `node scripts/check-chat-core-local.mjs`, `node scripts/test-order-core-guard.mjs`.
### 2026-05-27 - Customer Core: TikTok Seller Center + Lazada Open Platform

- Đã thêm Customer Core `marketplace_customer_contacts` để gom database khách hàng từ sàn, không để UI tự bóc DOM hoặc tự tính nguồn dữ liệu. UI mới `apps/fe/pages/customer-database.html` chỉ đọc `/api/customers/marketplace` và `/api/customers/marketplace/summary`.
- TikTok: dữ liệu khách hàng đi qua runner visible/headful `sync_detail` trong automation profile riêng, parser đọc `Chi tiết khách hàng`, ghi lại `orders_v2.customer_name/customer_phone` và `order_tracking_core.raw_data.shipping_address`; sau đó `/api/customers/marketplace/rebuild` gom vào Customer Core.
- Lazada: đã kiểm Lazada Open Platform, `GetOrders/GetOrder` trả customer details và `address_shipping` gồm tên, điện thoại, địa chỉ; sync Lazada hiện upsert contact từ `/orders/get` vào Customer Core, không dùng Seller Center/browser fallback cho shop API.
- Cài đặt vận hành: thêm `auto_customer_enabled`, khoảng chạy `customer_min_minutes/customer_max_minutes`; Radar local có chu kỳ `customer` để kéo Lazada API, queue TikTok detail runner và rebuild Customer Core.
- UI/UX skill đã cập nhật mục Customer Database UI Rules: màn hình khách hàng chỉ đọc Customer Core, được hiển thị trạng thái consent/contact, không tự thêm nút upload Facebook audience/kết bạn Zalo khi chưa có workflow và guard riêng.
- Còn phải kiểm production sau deploy: Worker API route `/api/customers/marketplace/*`, trang `customer-database.html` desktop/tablet/mobile, và runner TikTok order mẫu `584207479537960490` nếu profile automation đang đăng nhập.
- Chốt sau production verify: TikTok runner đã click đúng icon mắt `open_phone_plaintext` trong card `Chi tiết khách hàng`, chỉ lưu khi không còn dấu `*` và đủ tên/SĐT/địa chỉ. Readback order `584207479537960490`: `customer_name_updated=true`, `customer_phone_updated=true`, `shipping_address_available=true`.
- Customer Core guard đã khóa: `marketplace_customer_contacts` bỏ qua dữ liệu còn `*`, thiếu identity, thiếu SĐT hoặc thiếu địa chỉ. Production rebuild `limit=150` trả `upserted=1`, `skipped=149`, summary `total=1`, `with_phone=1`, `with_address=1`.
- Trang `customer-database.html` đã chuyển sang cột `Tên khách hàng / SĐT / Địa chỉ / ID khách hàng / Nguồn`, lọc trùng trên frontend và có nút `Tải CSV` cho dữ liệu đang lọc.
### 2026-05-27 - Dashboard daily Finance Core nối đủ shop

- Đã xử lý phần `Bán hàng & lợi nhuận theo ngày` bị thiếu shop: production D1 ngày `2026-05-27` có `orders_v2` đủ Lazada `kinhdoanhonlinegiasoc@gmail.com`, Shopee `chihuy1984/chihuy2309/phambich2312`, TikTok `0909128999`, nhưng `order_analytics` trước rebuild chỉ có TikTok `0909128999`.
- Đã rebuild production qua `/api/order-analytics/rebuild` với `from=2026-05-27`, `to=2026-05-27`, `sync_payment=false`: saved `27` normal orders, daily snapshot saved `5`, stale health hết `missing_order_analytics_rows`.
- Code chuẩn: `/api/dashboard`, `/api/revenue-by-day`, `/api/profit-by-day`, `/api/top-shop`, `/api/top-platform`, `/api/top-sku`, `/api/top-product`, `/api/top-sku-full` tự gọi rebuild không sync payment khi Finance Core báo `missing_order_analytics_rows`; UI không tự tính nghiệp vụ.
- UI daily thêm cột `Sàn / Shop`; chart doanh thu/lãi gom lại theo ngày để không lặp nhãn khi Core trả nhiều shop trong cùng ngày. `apps/fe/js/dashboard/kpi-daily-render.js` chỉ render field `platform/shop/revenue/profit` từ Core.
- Production readback API sau deploy: `/api/top-shop?from=2026-05-27&to=2026-05-27` trả `chihuy2309=1.657.000`, `chihuy1984=733.000`, `phambich2312=400.000`, `0909128999=180.000`, `kinhdoanhonlinegiasoc@gmail.com=59.000`; `/api/order-analytics/finance-core` `status=ok`, `orders=28`, `gross_revenue=3.029.000`, `stale_snapshot=false`.
- Deploy production: Worker API `huyvan-worker-api` version `d28e16bc-be66-4484-8aa2-5544cd6d6506`; static UI `shophuyvan-analytics` version `2f25784f-7a87-4723-bb50-528808287d04`.
- Kiểm thật production: mở `pages/profit-dashboard.html` và kiểm desktop/tablet/mobile; bảng daily có cột `Sàn / Shop`, đủ 5 shop, tổng `28` đơn / `3.029.000 đ`, không tràn ngang trang.
- Test pass: `node --check` các file sửa, `node scripts/test-ui-design-system-guard.mjs`, `node scripts/check-oms-core-regression-lock.mjs`, `node scripts/test-finance-snapshot-guard.mjs`, `node scripts/test-finance-taxonomy.mjs`, `git diff --check`.
- Còn mở: `apps/worker-api/src/routes/dashboard/index.js` đang `29.4KB`, sát giới hạn 30KB; lần sửa tiếp theo vào Dashboard route phải tách module trước khi thêm logic mới.
- 2026-05-27 Chat/CSKH Shopee order-context hotfix: đã sửa lỗi gửi tin chủ động cho đơn `260527GANU1XNM` bị Shopee trả `first_chat_without_order_info`. Worker bridge `huyvan-worker-api` gửi `order_sn` trong `content` của `/api/v2/sellerchat/send_message`, vẫn giữ fallback `source_content.order_sn`, và thêm route gửi thẻ đơn Shopee `/api/internal/chat-bridge/shopee/messages/order-card`.
- Deploy production: Worker chính `huyvan-worker-api` version `9d2eac2b-5336-4fd9-a730-b6b9064b7673`; Chat Worker `shophuyvan-chat-api` version `e70a812c-83de-4fae-aae2-8d692edd55ee`; Static UI `shophuyvan-analytics` version `72a8a689-969e-417c-93f6-ef35500030a5`.
- Production verification: gọi thật `POST /api/chat/messages/send` cho `conversation_id=order-context-260527GANU1XNM`, `order_id=260527GANU1XNM` trả `status=sent`, `platform_message_id=2415648592711041393`; mở UI production bằng profile `E:\codex-chrome-profiles\shophuyvan-test` thấy dòng mới `17:57 27-05 ... Đã gửi`, không còn lỗi `must contain order information`. Responsive mobile/tablet/desktop pass bằng `scripts/check-chat-core-browser.mjs`; desktop readback screenshot `artifacts/chat-core/shopee-order-sent-desktop.png`.
- Test: `npm test` trong `apps/chat-worker-api` pass; `node --check` Worker bridge/Chat adapter/UI events pass; `scripts/test-ui-design-system-guard.mjs` pass; `scripts/check-oms-core-regression-lock.mjs` pass. `scripts/test-order-chat-target.mjs` còn fail assertion TikTok cũ ngoài phạm vi hotfix sau khi phần Shopee đã được cập nhật.
- 2026-05-27 Chat/CSKH font hotfix: sửa mojibake trong `apps/fe/pages/chat-cskh.html` và toàn bộ `apps/fe/js/dashboard/chat/*.js`, thêm lớp `repairMojibake()` ở render text để dữ liệu cũ có `Â/Ã/Ä/áº` không lộ ra UI. Deploy static `shophuyvan-analytics` version `546c73cf-b9c5-48b9-8dda-287734ba23e8`; production check Chrome profile `E:\codex-chrome-profiles\shophuyvan-test` pass desktop/tablet/mobile, `hasMojibake=false`, `overflowX=false`, ảnh `artifacts/chat-core/chat-fontfix-*-final.png`.

### 2026-05-28 - Flash Sale tự động Worker/UI build mới

- Đã dựng luồng Flash Sale tự động mới, không thêm logic nghiệp vụ vào UI: Worker API có `apps/worker-api/src/routes/discounts/flash-deal-endpoints.js`, `flash-auto-settings.js`, `flash-auto-run.js` và engine `apps/worker-api/src/discounts/flash-auto-engine.js`; UI mới ở `apps/fe/pages/flash-auto.html`, `apps/fe/js/dashboard/flash-auto.js`, `apps/fe/css/flash-auto.css`.
- D1 production đã chạy migration `apps/worker-api/migrations/20260528_flash_auto.sql`, tạo `flash_auto_settings`, `flash_auto_logs` và seed 4 shop: Shopee `chihuy1984/chihuy2309/phambich2312` bật, Lazada `kinhdoanhonlinegiasoc` tắt.
- Shop API: Shopee dùng token từ shop auth hiện có rồi gọi endpoint Flashdeal được yêu cầu: `/api/v2/flashdeal/get_time_slot_id`, `/add_flash_deal_item`, `/update_flash_deal_item`, `/delete_flash_deal_item`, `/get_flash_deal_item`. Lazada đang để disabled, không giả nhãn API Flash Sale.
- Production readback `POST /api/discounts/flash-auto/run {"shop_id":"chihuy1984"}` trả đúng contract `{live_write_sent:false, verified:false, items_submitted:0}` và ghi `flash_auto_logs`, nhưng Shopee timeslot trả `error_not_found`; chưa được coi là live-write thành công.
- Deploy production: Worker API `huyvan-worker-api` version `b1b99694-33ca-4891-98ef-7d82e950b582`; static UI `shophuyvan-analytics` version `7c9d3798-e9ab-4206-ac08-7198e617d47f`.
- Kiểm UI production bằng Chrome profile `E:\codex-chrome-profiles\shophuyvan-test`: desktop `1440x900`, tablet `820x1180`, mobile `390x844` đều `overflowX=false`; 3 tab bấm được, toggle lưu được; bấm `Chạy ngay` bắt được toast `Lần thử 1/6 - đang gọi sàn...`. Evidence: `artifacts/flash-auto-20260528/`.
- Test pass: `node --check` cho các file Flash Auto mới và `promotions-actions.js`; import `routes/discounts/index.js` pass; `node scripts/test-ui-design-system-guard.mjs` pass. `rg "Ã|áº|Ä"` còn phát hiện mojibake cũ ở file ngoài phạm vi lượt này.
- Còn mở: cần xác minh lại path/quyền Shopee Flashdeal trong Open Platform vì endpoint mới đang trả `error_not_found`; chưa có `verified=true`, chưa có live-write được sàn xác nhận.
- Hotfix routing UI: `apps/fe/pages/promotions.html` nay là màn Flash Sale tự động mới đúng với menu `Khuyến mãi sàn`; màn danh sách chương trình cũ chuyển sang `apps/fe/pages/promotions-list.html`. Deploy static version `f6338d5a-a71f-41fc-9f5b-bec2dfedff44`; production `pages/promotions.html` pass desktop `1440x900`, tablet `820x1180`, mobile `390x844`, heading `Flash Sale tự động`, không còn panel cũ `Shopee Flash Sale`, `overflowX=false`.
- Sửa lại theo phản hồi UI: `apps/fe/pages/promotions.html` quay về đúng trang cha `Khuyến mãi sàn`, có tab con `Flash Sale tự động`, `Tổng quan`, `Shopee giảm giá`, `Voucher`, `Combo`, `Mua kèm`, `Lazada`; Flash Auto chỉ là panel con, không còn layout page riêng khi bấm menu Khuyến mãi.
- File chuẩn cập nhật: `apps/fe/pages/promotions.html`, `apps/fe/js/dashboard/promotions-tabs.js`, `apps/fe/js/dashboard/promotions-render.js`, `apps/fe/css/dashboard/promotions-page.css`, `apps/fe/css/flash-auto.css`. UI chỉ chuyển tab và gọi endpoint/read UI hiện có, không thêm nghiệp vụ khuyến mãi vào frontend.
- Deploy static mới: `shophuyvan-analytics` version `1103b251-13c0-4179-ada6-f98b54dacd3d`. Production Chrome profile `E:\codex-chrome-profiles\shophuyvan-test`: desktop `1440x900`, tablet `820x1180`, mobile `390x844` đều có tab con, mặc định mở `Flash Sale tự động`, bấm `Shopee giảm giá` rồi quay lại Flash Auto được, `overflowX=false`, không còn `.flash-auto-shell` hay tiêu đề cũ `Shopee Flash Sale` trong trang cha. Bấm `Chạy ngay` hiện toast `Đang khởi động Flash Sale tự động... | Lần thử 1/6 - đang gọi sàn...`.

### 2026-05-28 - Chat/CSKH realtime, push, Gemini AI và trang cài đặt riêng

- Chat Worker thêm webhook-first sync: `triggerImmediateSync(env, channel, shopId)` trong `apps/chat-worker-api/src/core/sync-core.js` và `routes/webhook-ingest.js` gọi qua `ctx.waitUntil` sau khi persist webhook, không chờ cron. Cron giờ là safety net theo `poll_interval_seconds`, còn browser helper đọc `browser_helper_poll_seconds` thay vì hardcode 3 phút.
- Realtime Durable Object `ChatRealtimeRoom` thêm queue memory tối đa 50 tin/5 phút và replay cho client mới nối lại; heartbeat giảm xuống 15 giây. Frontend `apps/fe/js/dashboard/chat/realtime.js` có reconnect 2s/4s/tối đa 30s và polling fallback 15 giây sau 3 lần mất WebSocket.
- Push notification thêm retry 3 lần, timeout 10 giây, APNs headers cho endpoint Apple, cột `retry_count`, `last_retry_at`; frontend có `manifest.json`, `service-worker.js`, meta PWA và banner hướng dẫn iPhone thêm vào màn hình chính.
- Gemini AI mặc định chuyển sang `ai_provider=gemini`, có `ai_status`, route `GET /api/chat/ai/status`, timeout 10 giây khi gọi Gemini, xoay vòng 1-5 key, route knowledge base `GET/POST/DELETE /api/chat/ai/knowledge` và `POST /api/chat/ai/approve`. Bảng mới: `ai_knowledge_base`.
- UI Chat thêm cảnh báo realtime từ khóa cấm ngay khi gõ composer và chặn gửi ở frontend trước khi backend chặn cuối cùng. Danh sách từ khóa public được trả qua `GET /api/chat/settings`.
- Trang cài đặt riêng mới `apps/fe/settings.html` có 6 tab: Tổng quan, AI, Kênh chat, Từ khóa cấm, Thông báo, Nâng cao; có nút `Lưu API Gemini` riêng, cấu hình poll/helper, quản lý knowledge base, test push, cleanup/export/reset.
- R2 maintenance: `exportKnowledgeBaseToR2`, `cleanupR2OldFiles` dùng `customMetadata.expires_at`; export AI giữ 180 ngày, cleanup chạy khung 3 giờ sáng Việt Nam khi scheduled sync chạy.
- Deploy production: Chat Worker `shophuyvan-chat-api` version `7af1b583-f3ca-4204-af47-95e55c23dd00`; static Worker assets `shophuyvan-analytics` version `39d860d1-3103-47de-a699-94e2d2047870`. Không deploy Worker chính `huyvan-worker-api` trong lượt Chat này.
- Test local đã pass: `node --check` các file Chat Worker/UI mới sửa, `node scripts/test-chat-ai-policy.mjs`, `node scripts/check-chat-core-local.mjs`, `node scripts/test-ui-design-system-guard.mjs`, quét mojibake bằng Node cho Chat Worker/Chat UI/settings trả `bad=[]`.
- Production readback API pass: `/api/chat/health`, `/api/chat/settings`, `/api/chat/settings/stats`, `/api/chat/ai/status`, `/api/chat/ai/knowledge`, `/api/chat/notifications/status` đều trả 200; Gemini test production dùng key đã lưu trả OK và `ai_status=active`.
- Production UI pass bằng Chrome profile `E:\codex-chrome-profiles\shophuyvan-test`: `pages/chat-cskh.html` desktop/tablet/mobile không tràn ngang, không mojibake, realtime banner ẩn, không console/http error; `settings.html` đủ 6 tab, có nút `Lưu API Gemini`, desktop/tablet/mobile không tràn ngang; composer gõ `zalo` hiện cảnh báo từ khóa cấm và chưa gửi tin.
- Còn mở: iPhone push chỉ nhận được khi người dùng mở bằng Safari từ Home Screen và cấp quyền notification; profile Chrome hiện báo thông báo bị chặn nên không thể xác nhận OS notification thật trên profile đó.
### 2026-05-28 - Chat/AI Gemini key append fix

- Lỗi: khi người dùng nhập thêm Gemini key mới ở `settings.html`, Chat Worker đang xử lý `gemini_api_keys_input` như danh sách thay thế nên có thể làm mất key cũ.
- Đã sửa `apps/chat-worker-api/src/core/ai-settings-defaults.js`: `gemini_api_keys_input` giờ chỉ append vào `current.gemini_api_keys`, dedupe và giữ tối đa 5 key; input rỗng giữ nguyên key đang lưu. Trường nội bộ `gemini_api_keys` vẫn là replace có chủ đích để reset/xóa cấu hình hệ thống.
- Đã sửa `apps/fe/settings.html`: label/placeholder/nút/toast nói rõ đây là thao tác thêm key mới và key cũ vẫn được giữ.
- Test pass: `node --check apps/chat-worker-api/src/core/ai-settings-defaults.js`, `node --check scripts/test-chat-ai-policy.mjs`, `node scripts/test-chat-ai-policy.mjs`, `npm --prefix apps/chat-worker-api test --if-present`, `node scripts/test-ui-design-system-guard.mjs`, kiểm inline script `settings.html`.
- Deploy production: Chat Worker `fde42ef4-81ce-4c38-afdc-696a6563d956`; static `shophuyvan-analytics` `399e0247-08e2-4cf6-89e0-ad2b9e9bbdfa`.
- Readback production: `/api/chat/ai/status` trả `gemini_key_count=2`, `ai_status=active`, model `gemini-2.5-flash`. Không thêm key giả vào production để tránh làm bẩn vòng xoay key thật.
- UI production pass desktop `1366x900`, tablet `820x1180`, mobile `390x844`: không tràn ngang, không mojibake/undefined, hiện `Thêm API Gemini xoay vòng`, placeholder `Key cũ vẫn được giữ`, và `Đã lưu 2/5 key Gemini`.
- Screenshot ngoài repo: `E:\shophuyvan-runtime\verification\gemini-key-append-20260528\desktop.png`, `tablet.png`, `mobile.png`.

### 2026-05-28 - Chat/AI key count, học AI và auto-reply guard

- Đã sửa trang `apps/fe/settings.html`: tab AI hiển thị số key Gemini đã lưu ngay trong card `Kết nối Gemini` (`Đã lưu 1/5 key Gemini` trên production), dòng trạng thái học AI hiển thị số knowledge entries và thời gian tự trả lời. Nút `Lưu API Gemini` khi ô key trống không còn gửi `gemini_api_keys_input=''`, nên không xóa key đã lưu.
- Đã sửa Chat UI `apps/fe/js/dashboard/chat/events.js`: khi nhân viên dùng gợi ý AI rồi gửi thành công, frontend gọi `POST /api/chat/ai/approve` với `save_to_knowledge=true` để lưu câu hỏi/câu trả lời vào `ai_knowledge_base`. UI không tự tính nghiệp vụ, chỉ gọi Chat Core route.
- Đã sửa Chat Worker `apps/chat-worker-api/src/core/ai-policy-core.js` và `apps/chat-worker-api/src/core/sync-core.js`: policy chỉ cho auto-send khi không vi phạm từ khóa/pattern và `policy_status='approved'`; cron `*/2 * * * *` chạy thêm `runAutoReplyQueue()` để chọn hội thoại có tin khách quá hạn `auto_reply_minutes`, capability gửi là `official_api/bridge`, rồi gửi bằng `sendChatMessage()` với source `ai_auto_reply`.
- Production readback API: `/api/chat/ai/status` trả `ai_status=active`, `gemini_key_count=1`; `/api/chat/settings` trả `gemini_api_key_count=1`, `allow_auto_send=true`, `auto_reply_minutes=5`; `/api/chat/ai/knowledge` tạo/xóa test entry thành công. D1 read-only query có `47` candidate auto-reply theo điều kiện 5 phút tại thời điểm kiểm, cron sẽ xử lý theo guard mỗi 2 phút.
- Deploy production: Chat Worker `shophuyvan-chat-api` version `c99b6b56-2f04-442a-8c51-61cf2cb2c8f8`; static UI `shophuyvan-analytics` version `0c59ad14-b97f-4998-9cf2-28ceb2ac2784` (static deploy chỉ upload `/settings.html` và `/js/dashboard/chat/events.js`).
- Production UI verification: `settings.html?verify=chat-ai-fix-20260528g` pass desktop `1366x900`, tablet `820x1180`, mobile `390x844`: `overflowX=false`, tab AI active, key count visible, learning count visible, `hasMojibake=false`, `hasUndefined=false`. Screenshots lưu ngoài repo tại `E:\shophuyvan-runtime\verification\chat-ai-settings-20260528\`.
- Test pass: `npm --prefix apps/chat-worker-api test --if-present`, `node --check` các file sửa, `node scripts/test-chat-ai-policy.mjs`, `node scripts/test-ui-design-system-guard.mjs`, kiểm syntax inline script `settings.html`. Còn mở: CDP không attach được profile `E:\codex-chrome-profiles\shophuyvan-test` do profile đang bị Chrome khác giữ lock, nên kiểm tự động 3 breakpoint dùng Chrome headful profile tạm trong runtime; API production đã đọc trực tiếp từ Chat Worker thật.

### 2026-05-28 - Chat policy chặn định dạng SĐT và website

- Đã sửa Chat Core policy để không chỉ dựa vào từ khóa chữ. Backend `apps/chat-worker-api/src/core/ai-policy-core.js` nay luôn chặn định dạng số điện thoại Việt Nam (`0909128999`, `090 912 8999`, `+84...`) và định dạng website/domain (`shophuyvan.vn`, `www...`, `https://...`) trước khi lưu/gửi tin.
- Route chuẩn mới: `POST /api/chat/policy/check` trên Chat Worker. UI Chat gọi route này trước optimistic append, nên nội dung bị chặn không được đưa vào thread và không đi adapter sàn. Settings preview cũng gọi route này để test câu `0909128999 shophuyvan.vn` ra trạng thái bị chặn.
- File chuẩn đã sửa: `apps/chat-worker-api/src/core/ai-policy-core.js`, `apps/chat-worker-api/src/core/ai-settings-defaults.js`, `apps/chat-worker-api/src/routes/ai.js`, `apps/chat-worker-api/src/index.js`, `apps/fe/js/dashboard/chat/events.js`, `apps/fe/settings.html`, `scripts/test-chat-ai-policy.mjs`.
- Test local đã pass: `npm --prefix apps/chat-worker-api test --if-present`, `node --check apps/fe/js/dashboard/chat/events.js`, `node --check scripts/test-chat-ai-policy.mjs`, `node scripts/test-chat-ai-policy.mjs`, settings inline script syntax check.
- Chưa deploy/readback production trong mục này ở thời điểm ghi chú: cần deploy Chat Worker + static, sau đó kiểm `/api/chat/policy/check`, `/settings.html` preview và `pages/chat-cskh.html` desktop/tablet/mobile bằng profile `E:\codex-chrome-profiles\shophuyvan-test`.
### 2026-05-28 - Product Core search tên dài cho Chat AI

- Đã sửa lỗi `/api/core/products/search` trên Worker chính bị `worker_unhandled_error` với tên sản phẩm Lazada dài có nhiều từ/dấu (`LIKE or GLOB pattern too complex`). Product search giờ tách token an toàn và ưu tiên token dạng SKU/mã như `K75` khi câu hỏi có mã sản phẩm.
- Đã tách file theo guard 30KB: `apps/worker-api/src/core/products/core-product-read-core.js` sở hữu `getCoreProductBySku/searchCoreProducts`; `apps/worker-api/src/core/shared-data/shop-core-data.js` sở hữu `listCoreShops/getCoreShopSummary`; `apps/worker-api/src/core/shared-data/core-data-core.js` còn Order/shared read và đã xuống dưới 30KB.
- Deploy production Worker chính `huyvan-worker-api` version `204213c9-6b18-4b49-8c73-50712e17ec4c`. Không deploy static UI, không deploy Chat Worker.
- Production readback: query dài `Ron PVC chặn khe hở... K75`, `Cuộn Ron Cửa Chống Côn Trùng K75`, `Door Seal Roll Blocks Gaps K75` đều trả `200`, `matched_product_core`, `search_needles=["K75"]`, kết quả đầu là SKU K75; `/api/core/products/by-sku/K75_MAUNAU5CM1M` vẫn pass.
- Chat AI dry-run lại hội thoại Lazada `lazada_200166591213_200001352163_1_200166591213_2_103`: `order_context_count=1`, `product_context_count=5`, `core_context_warnings=[]`, `context_risk_flags=[]`, `auto_send=false` vì intent còn `needs_review/unclear_question`; suggestion test đã gọi `/api/chat/ai/reject` để không lưu học nhầm.
- Test pass: `npm --prefix apps/worker-api test --if-present`, `node scripts/test-product-core-search.mjs`, `node scripts/test-chat-ai-context.mjs`, `node scripts/test-chat-ai-policy.mjs`, scoped `node --check`, scoped `git diff --check`, scoped mojibake scan.
- Endpoint/marketplace: không thêm endpoint sàn mới; đây là route Core nội bộ đọc Product Master/Warehouse snapshot. Shop Lazada API vẫn dùng dữ liệu đã sync vào Product Core; không phát sinh `api_permission_missing`, `token_scope_missing`, `endpoint_not_available`.
### 2026-05-28 - Customer Database rebuild giữ dữ liệu cũ

- Đã sửa Customer Core `apps/worker-api/src/core/customer/contacts-core.js`: `/api/customers/marketplace/rebuild` không còn `DELETE` contact cũ trước khi quét lại. Rebuild giờ chỉ đọc Order/Tracking/Finance Core rồi upsert/merge vào `marketplace_customer_contacts`.
- Bảng phụ mới `marketplace_customer_contact_orders` lưu dấu `contact_key + source_order_id` để lần rebuild lặp lại không cộng trùng `order_count`/`total_revenue`, nhưng vẫn append đơn mới cho cùng khách khi quét được thêm dữ liệu.
- Route/file chuẩn: đọc `GET /api/customers/marketplace`, `GET /api/customers/marketplace/summary`; ghi nội bộ `POST /api/customers/marketplace/upsert`, `POST /api/customers/marketplace/rebuild`. UI `apps/fe/pages/customer-database.html` vẫn chỉ render Customer Core.
- Test pass: `node --check apps/worker-api/src/core/customer/contacts-core.js`, `node --check apps/worker-api/src/routes/customer/index.js`, `node --check scripts/test-customer-contacts-core.mjs`, `node scripts/test-customer-contacts-core.mjs`, `node scripts/test-ui-design-system-guard.mjs`.
- Deploy/readback production: Worker chính `huyvan-worker-api` version `61ec6d10-815a-4dcc-b9bc-e3ec4f3e83af`; `POST /api/customers/marketplace/rebuild` quét 150 đơn, upsert 8, skip 142; `GET /api/customers/marketplace/summary` trả tổng 8, TikTok 8, Lazada 0, có SĐT 8. UI production `/pages/customer-database` đã bấm `Đồng bộ lại Core` và kiểm desktop/tablet/mobile bằng profile `shophuyvan-test`: không tràn ngang, không mojibake/`undefined`, số khách vẫn 8.
### 2026-05-28 - Zalo browser-helper Chat Core + auto-send local

- Đã tạo và đổi tên 2 profile Chrome automation đúng account Zalo: `E:\shophuyvan-python-automation\profiles\browser\Zalo_Shop_Huy_Van_0909128999` trên CDP `9241` và `E:\shophuyvan-python-automation\profiles\browser\Zalo_Nghiem_Chi_Huy_0848881111` trên CDP `9242`; cả hai mở visible/headful, không headless.
- Zalo tool local ở `E:\tool zalo` đã bám profile chuẩn mới, auto-send bật mặc định bằng `ZALO_AUTO_SEND_ENABLED=1`, vẫn chặn hội nhóm, người thân/nội bộ, stranger/system, khiếu nại, hoàn tiền, bảo hành, pháp lý, thông tin nhạy cảm và câu không phải nhu cầu bán hàng rõ.
- Đã thêm bridge local `channel=zalo` -> Chat Worker `/api/chat/browser-helper/push`, token đọc từ `E:\shophuyvan-python-automation\data\config\browser_helper.local.json`, không in secret ra log. Chat Core vẫn là nơi lưu chung; UI nên hiển thị Zalo bằng tab/filter riêng do chính sách khác chat sàn.
- Kiểm thật local: `node --check` pass cho `E:\tool zalo\server.js`, `src/services/zaloAutomation.js`, `src/services/shophuyvanChatBridge.js`; server test `http://127.0.0.1:8794/api/automation/slots` trả 2 slot ok, `autoSendEnabled=true`, `shophuyvanChatBridge.configured=true`.
- Sync thật 2 account pass: `Shop Huy Vân` có `count=1`, `autoReplyCount=0`; `Nghiem Chi Huy` có `count=60`, `autoReplyCount=0`. Không có khách đủ điều kiện cần auto-reply tại thời điểm kiểm, nên không gửi live tin mới.
- Production API readback sau push thật: `GET https://shophuyvan-chat-api.zacha030596.workers.dev/api/chat/conversations?channel=zalo&shop_id=zalo_shop_huy_van_0909128999&limit=3` trả 3 hội thoại Zalo, tiếng Việt đúng khi kiểm bằng Node fetch, `shop_chat_mode=browser_helper`, `send_capability=manual_only`, `sync_capability=browser_helper`.
- Deploy production static `shophuyvan-analytics` version `21793972-66ab-4465-8d1c-209543a70f91`; Wrangler chỉ upload `/pages/chat-cskh.html` và `/css/dashboard/chat.css`. Không deploy Worker chính, không deploy Chat Worker.
- Production UI verification `/pages/chat-cskh.html`: desktop/tablet/mobile đều `overflowX=false`, không console/http error; hội thoại Zalo `Kỹ Thuật Hoàng Nhân` hiện đầu danh sách chung, badge `.ch-zalo` màu `rgb(0, 104, 255)`. Artifact: `E:\shophuyvan-runtime\verification\zalo-chat-core-ui-20260528-*.png`.
- Endpoint đã dùng: Chat Worker browser-helper chuẩn. Endpoint Zalo official chat chưa dùng; fallback browser-helper vì Zalo Web đang là luồng local operator, không giả lập `official_api`.
- Còn mở: nếu muốn đổi tên folder theo account khác sau này, phải đóng đúng PID profile rồi rename, không rename khi Chrome đang giữ session.

### 2026-05-28 - Zalo automation port fallback, scan interval, compact windows

- Đã bổ sung cơ chế xoay port cho `E:\tool zalo\server.js` và `start-zalo-tool.bat`: nếu port yêu cầu bận thì thử port kế tiếp trong giới hạn `PORT_FALLBACK_ATTEMPTS`. Kiểm thật: khi `8794` đang bận, server mới tự chạy `8795`; `start-zalo-tool.bat --print` tự chọn `8788` vì `8787` đang bận.
- Đã thêm cài đặt chu kỳ quét Zalo tự động trong dialog Cài đặt AI của local tool: `automation.scanIntervalSeconds`, mặc định 30 giây, giới hạn 15-3600 giây; server background sync đọc setting động sau mỗi vòng.
- Đã thêm cài đặt cửa sổ Zalo: `windowWidth/windowHeight/windowLeft/windowTop/windowGap`; launcher mở 2 profile visible/headful nhỏ ở góc trên. Kiểm CDP: slot 1 `520x760` tại `0,0`, slot 2 `520x760` tại `540,0`.
- Đã sửa launcher ưu tiên Chrome trước Edge để không làm mất session profile Chrome; 2 account Zalo reconnect `loggedIn=true`, `needQr=false`, AI enabled, `aiRuntimeReady=true`, bridge configured.
- AI auto-reply Zalo đã tích hợp trong local tool qua `maybeAutoReplyFromConversation`: chỉ tự gửi khi account bật AI, AI runtime ready, tin mới nhất là khách, hội thoại không bị chặn, nội dung là nhu cầu bán hàng/greeting và không thuộc nhóm risk. Lượt kiểm hiện tại không có tin khách mới đủ điều kiện nên `autoReplyCount=0`, không gửi bừa.
### 2026-05-28 - Zalo scan setting, history sync và send blocker người lạ

- 2026-05-28 kiểm lại trực tiếp bằng CDP trên Zalo Web thật, không chỉ đọc log: slot 1 `Zalo - Shop Huy Vân` port `9241`, slot 2 `Zalo - Nghiem Chi Huy` port `9242`; screenshot lưu tại `E:\shophuyvan-runtime\verification\zalo-direct-20260528\`.
- Kết quả slot 1: Zalo Web thật hiện banner `Zalo Web của bạn hiện chưa có đầy đủ tin nhắn gần đây`; hội thoại `Kỹ Thuật Hoàng Nhân` là `NGƯỜI LẠ`, có 2 tin shop gửi `dạ`, `khách đấu được chưa ạ`, giờ hiển thị `20:40`, trạng thái `Đã gửi`.
- Kết quả slot 2: Zalo Web thật đang mở `严千欣（nta)`, có tin inbound `bá oi kêu má lát 4h30 chở zín nha bá`, ngày `T6 22/05/2026`, giờ `16:11`; Chat Core lưu đúng `sender_type=customer`.
- Đã sửa scraper Zalo để đọc `.chat-date` và kế thừa giờ bị Zalo ẩn trong cùng nhóm bubble; tin có `20:40` lưu `created_at=2026-05-28T13:40:00.000Z`, tin có `16:11` lưu `created_at=2026-05-28T09:11:00.000Z`.
- Đã sửa background sync: trước đây timer 30 giây chỉ sync các hội thoại đủ điều kiện auto-reply; bây giờ mỗi vòng sync các hội thoại Zalo gần nhất vào Chat Core, auto-reply vẫn tách riêng.
- Kiểm auto-sync thật sau sửa: sau 90 giây không bấm tay, slot 1 `lastAutomationSyncAt` đổi `16:20:20` -> `16:21:21`; slot 2 tự sync thêm các hội thoại như `Suleo Vina`, `Đặng Kim Dũng`, `Siêu Thị Điện Máy Thắng Hằng` lúc `16:21:27-16:21:46`.
- Còn lỗi dữ liệu bẩn: Chat Core của hội thoại `Kỹ Thuật Hoàng Nhân` còn các bản duplicate `msg_*` từ lượt sync trước khi sửa stable id/time; đã phát hiện nhưng chưa cleanup được an toàn trong lượt này.
- Sự cố đã xử lý: thử cleanup D1 bằng SQL trực tiếp gây xóa rộng `chat_messages`; đã khôi phục `shophuyvan-chat-db` bằng D1 Time Travel bookmark `000002ea-00000289-00005079-2872c62c72dbc297778266af07292f9c`. Readback sau restore: `chat_messages=1807`, `chat_conversations=431`. Không tiếp tục DELETE trực tiếp trong lượt này.
- Đã thêm cấu hình Zalo local trong `settings.html` tab `Kênh chat`: hiển thị trạng thái helper `8794`, 2 slot CDP, AI/auto-send, slider `Quét Zalo tự động` và nút `Đồng bộ lịch sử Zalo`.
- Đã thêm endpoint local helper `POST http://127.0.0.1:8794/api/shophuyvan-chat/sync-history`: sync một hội thoại hoặc toàn account Zalo, đọc bằng Chrome CDP visible/headful, push về Chat Core qua `/api/chat/browser-helper/push`, không auto-reply trong lượt history backfill.
- Đã nối nút Sync của Chat/CSKH cho kênh `zalo`: thanh sync bên trái có dòng Zalo, bấm Sync dùng helper local thay vì route sàn; `apps/fe/js/dashboard/chat/data.js` gọi `postZaloHistorySync()`.
- Đã sửa khóa tin nhắn Zalo local trong `E:\tool zalo\src\services\shophuyvanChatBridge.js` theo chữ ký ổn định `conversation + direction + visible time + text hash` để bấm sync lặp không nhân đôi do DOM id Zalo đổi.
- Kiểm thật local: `GET /api/automation/slots` trả `port=8794`, PID `23452`, 2 slot `ok=true`, `scanIntervalSeconds=30`, `autoSendEnabled=true`, `aiRuntimeReady=true`, bridge configured.
- Kiểm sync lịch sử: hội thoại Zalo `Kỹ Thuật Hoàng Nhân / 8195779656939267821` sync `messages_synced=2`, Chat Core push ok; lần sync lặp sau khi sửa dedupe trả `saved_messages=0`, `skipped_duplicates=2`.
- Kiểm gửi tin test theo yêu cầu: `POST /api/shophuyvan-chat/send` với nội dung `ok` trả HTTP 400 `error_code=zalo_requires_friend`, `error_message=Zalo không cho gửi hội thoại người lạ; cần kết bạn trước.` Đây là blocker từ Zalo Web, không phải lỗi nút gửi/bridge.
- File chuẩn đã sửa trong lượt này: `E:\tool zalo\server.js`, `E:\tool zalo\src\services\shophuyvanChatBridge.js`, `apps/fe/settings.html`, `apps/fe/pages/chat-cskh.html`, `apps/fe/js/dashboard/chat/data.js`, `apps/fe/js/dashboard/chat/render.js`.
- Deploy/verify production: static `shophuyvan-analytics` version `bfa32e29-cc0c-497a-bcb4-c5a5ee71716c`; Settings/Chat pass desktop/tablet/mobile `overflowX=false`. Settings tab `Kênh chat` hiện `Zalo local helper`, `Quét Zalo tự động: 30 giây`, `Đồng bộ lịch sử Zalo`; Chat/CSKH có dòng Sync Zalo, composer Zalo có nút `Gửi`.
- Còn mở: gửi Zalo với hội thoại `Kỹ Thuật Hoàng Nhân` vẫn bị Zalo Web chặn vì khách chưa kết bạn; muốn test sent thật phải chọn hội thoại đã kết bạn hoặc kết bạn với khách hiện tại trước.

### 2026-05-29 - UI Flash Sale tự động trong Khuyến mãi sàn

- Đã đọc đầy đủ AGENTS + bộ UI guard bắt buộc và sửa trực tiếp cụm UI `Khuyến mãi sàn > Flash Sale tự động` theo hướng vận hành rõ ràng hơn.
- File đã chỉnh đúng scope: `apps/fe/js/dashboard/flash-auto.js`, `apps/fe/css/flash-auto.css`, `apps/fe/css/dashboard/promotions-page.css`.
- Đã thay control bật/tắt dạng checkbox thô thành switch card chuẩn UI: có trạng thái `Bật/Tắt`, mô tả ngắn nghiệp vụ, thao tác bấm rõ ràng, không còn ô tick to gây vỡ layout.
- Đã chỉnh lại hierarchy phần cài đặt: panel/section/card đồng bộ spacing, nâng độ tương phản header tab con Flash Auto, bảng lịch chạy/lịch sử giữ số liệu tabular và badge trạng thái mềm.
- Đã sửa logic hiển thị lịch theo từng shop trong tab `Lịch chạy` (mỗi shop đọc đúng `schedule_days` riêng, không dùng nhầm lịch của shop đang chọn).
- Check pass: `node --check apps/fe/js/dashboard/flash-auto.js`, `node scripts/test-ui-design-system-guard.mjs --files ...`, scan mojibake scope sửa không có marker lỗi.
- Hook policy: đã chạy `after-edit` và `before-final` với profile `standard`, pass (các finding console/secret-like còn lại thuộc worktree bẩn sẵn ngoài phạm vi lượt này).
- Chưa deploy trong lượt này; chưa verify production bằng browser automation do môi trường Playwright extension không sẵn trong phiên hiện tại (`Playwright Extension not found`).
- Còn mở: cần verify tay production 3 viewport (390x844, 820x1180, 1366x900) bằng profile `E:\codex-chrome-profiles\shophuyvan-test` trước khi chốt PASS production.
### 2026-05-30 - Chat/CSKH settings UI và Zalo scheduler visibility

- Đã sửa Phase 1 UI/UX theo audit `react_reviewer_ecc`: trang `/settings` không còn hiện cấu hình Zalo giả khi helper offline; card Zalo local helper có thêm trạng thái scheduler `Đang bật/Đang quét`, lần quét cuối, lần kế tiếp và lỗi cuối từ `automationScheduler`.
- Đã đổi copy kỹ thuật trên `/settings`: `Knowledge Base` -> `Bộ nhớ trả lời`, `Web Push` -> `Thông báo trình duyệt`, `VAPID Public Key` -> `Mã đăng ký trình duyệt`, `Raw webhook payload` -> `Dữ liệu gốc từ sàn`, `Database` -> `Thống kê dữ liệu`, `Export Knowledge Base` -> `Xuất bộ nhớ AI`.
- Đã thêm chống double-click/pending cho các action ghi dữ liệu chính trong `apps/fe/settings.html`: lưu Gemini, test Gemini, lưu AI, lưu bộ nhớ, lưu kênh, lưu Zalo local, đồng bộ lịch sử Zalo, thêm bộ nhớ, lưu từ khóa, đăng ký/test thông báo, export, cleanup, reset.
- Đã bỏ hướng dẫn terminal/path Python khỏi modal helper trong `apps/fe/js/dashboard/chat/events.js`; UI chỉ hiển thị blocker nghiệp vụ và hướng operator kiểm tra diagnostic/local helper.
- Đã neo màu Chat/CSKH vào token chung `--shv-*` trong `apps/fe/css/dashboard/chat.css`; sửa biến sai `--chat-text`/`--chat-muted` và ép AI settings grid về 1 cột để tránh tràn trong panel hẹp.
- Test local pass: trích xuất script từ `apps/fe/settings.html` bằng `new Function`, `node --check apps/fe/js/dashboard/chat/events.js`, `node scripts/test-ui-design-system-guard.mjs`.
- Deploy production static `shophuyvan-analytics` version cuối `ecaa360e-be6b-47c1-8924-200d0f5ded9c`; không deploy Worker chính và không deploy Chat Worker. Lần deploy đầu trong lượt này là `a775d4a1-cf37-48ec-953f-a8adc7f5a404`, lần sau chỉ upload `settings.html` để sửa overflow mobile.
- Production verification bằng Chrome profile `E:\codex-chrome-profiles\shophuyvan-test` qua CDP `9337`: `/settings.html?verify=chat-ui-zalo-scheduler-20260530b` desktop `1366x900`, tablet `820x1180`, mobile `390x844` đều `overflowX=false`; tab `Kênh chat` hiển thị scheduler Zalo, `Đang chạy cổng 8794`, 2 profile đang mở, scan `30`, không còn các nhãn `Knowledge Base/Web Push/VAPID/Raw webhook/python tiktok_helper`.
- Nợ UI còn lại theo audit: OMS/logistics còn endpoint/raw JSON/request id, Product/Purchase còn copy `Core/Backend`, một số file JS/CSS >30KB cần phase refactor riêng.
### 2026-05-30 - Progress handoff skill cho viec dang do

- Da tao skill `shophuyvan-progress-handoff` de luu/doc lai tien trinh dang do khi can tiep tuc o khung chat moi.
- File chuan moi: `skills/shophuyvan-progress-handoff/SKILL.md`, `skills/shophuyvan-progress-handoff/agents/openai.yaml`, `skills/shophuyvan-progress-handoff/scripts/progress-handoff.mjs`.
- Da dong bo ban Codex global tai `C:\Users\Admin\.codex\skills\shophuyvan-progress-handoff` de chat moi co the goi skill truc tiep.
- Noi luu handoff: `docs/handoff/LATEST.md` va lich su `docs/handoff/YYYYMMDD-HHmmss-slug.md`; khong luu secret/token/cookie/raw config.
- Da them routing ngan trong `AGENTS.md`: "Tiep tuc viec dang do", "luu tien trinh", "handoff chat moi" -> `shophuyvan-progress-handoff`.
- Da ghi handoff hien tai cho viec `Promotions UI/UX redesign`: `docs/handoff/LATEST.md`, `docs/handoff/20260530-120142-promotions-ui-ux.md`; ban `20260530-115937-promotions-ui-ux.md` la lich su truoc khi dong bo skill global.
- Test pass: `node --check skills/shophuyvan-progress-handoff/scripts/progress-handoff.mjs`, `python C:\Users\Admin\.codex\skills\.system\skill-creator\scripts\quick_validate.py skills\shophuyvan-progress-handoff`, `node skills/shophuyvan-progress-handoff/scripts/progress-handoff.mjs latest/list`.
- Con mo: UI/UX Khuyen mai san moi doc va inspect code, chua sua layout, chua deploy, chua verify production desktop/tablet/mobile.

### 2026-05-30 - Flash Sale tu dong: 1 cau hinh cho nhieu shop (batch)

- Da them backend batch cho Flash Auto, giu nguyen contract cu:
  - `POST /api/discounts/flash-auto/settings/batch`: nhan `template + shop_ids[]`, luu theo tung shop.
  - `POST /api/discounts/flash-auto/run/batch`: chay tung shop doc lap (parallel), tra `results[] + summary`.
  - Route cu van giu nguyen: `POST /api/discounts/flash-auto/settings`, `POST /api/discounts/flash-auto/run`.
- Da cap nhat UI tab `Khuyen mai san > Flash Sale tu dong > Cai dat`:
  - Chon nhieu shop `Chon ap dung`, `Chon tat ca`, `Giu lai 1 shop dang sua`.
  - Nut `Luu mau dung chung` ap template hien tai cho nhieu shop.
  - Nut `Chay ngay cho shop da chon` ho tro batch; neu chi 1 shop thi fallback flow cu.
  - Co bang ket qua theo tung shop (thanh cong/chua xong, so SP dang ky/xac nhan, thong diep de hieu).
- File da sua trong scope:
  - `apps/worker-api/src/routes/discounts/flash-auto-settings.js`
  - `apps/worker-api/src/routes/discounts/flash-auto-run.js`
  - `apps/fe/js/dashboard/flash-auto.js`
  - `apps/fe/css/flash-auto.css`
  - `apps/fe/pages/promotions.html`
- Test pass:
  - `node --check apps/worker-api/src/routes/discounts/flash-auto-settings.js`
  - `node --check apps/worker-api/src/routes/discounts/flash-auto-run.js`
  - `node --check apps/fe/js/dashboard/flash-auto.js`
  - Size check: `flash-auto.js=29481`, `flash-auto.css=9171`, `promotions.html=9132` (<30KB).
- Hook bridge:
  - `before-edit`: pass
  - `after-edit`: pass
- Deploy/verify production:
  - Da deploy Worker `huyvan-worker-api` version `f70be183-0519-4917-a421-35cb1432c919`.
  - Da deploy static `shophuyvan-analytics` version `c2287853-c238-401b-8b29-8031d95cbc3f`.
  - Da verify endpoint production:
    - `POST /api/discounts/flash-auto/settings/batch` sample 2 shop tra `status=ok`, `summary.total=2`, `summary.success=2`.
    - `POST /api/discounts/flash-auto/run/batch` payload rong tra `400` (guard input hop le).
  - Da verify static production co cache-bust moi `flash-auto-20260530c` va nut `data-flash-command=\"run-now\"` tren trang promotions.
  - Chua verify browser 3 viewport trong luot nay do moi truong Playwright extension khong san (`Playwright Extension not found`), can chay verify tay/Chrome profile o buoc tiep theo.
- Endpoint report bat buoc:
  - Da kiem + da dung: `/api/discounts/flash-auto/settings/batch`, `/api/discounts/flash-auto/run/batch`.
  - Thieu quyen: tra ve theo tung shop tu engine (`api_permission_missing`/`token_scope_missing`) va tong hop vao `summary.permission_denied`.
  - Endpoint khong co: chua ghi nhan moi trong phase nay.

### 2026-05-30 - Hotfix mojibake UI Flash Sale tự động (Khuyến mãi sàn)

- Đã fix lỗi font/encoding tiếng Việt trong `apps/fe/js/dashboard/flash-auto.js` (toàn bộ label, trạng thái, toast, tiêu đề section, bảng lịch và lịch sử).
- Root cause: chuỗi UI bị mojibake (`ChÆ°a`, `ÄÃ£`, `ThÃ nh cÃ´ng`, ...), làm giao diện production hiển thị sai font/chữ dù layout đã có.
- Đã sửa trực tiếp theo đúng copy tiếng Việt vận hành; không đổi contract API, không thêm nguồn dữ liệu thứ hai, UI vẫn chỉ đọc từ luồng hiện có.
- Check pass:
  - `node --check apps/fe/js/dashboard/flash-auto.js`
  - `rg "Ã|áº|Ä|Â|Æ|�" apps/fe/js/dashboard/flash-auto.js` -> không còn kết quả
  - file size sau fix: `28725` bytes (<30KB)
- Hook bridge pass: `before-edit`, `after-edit`, `before-final` (profile `standard`).
- Chưa deploy trong lượt hotfix này; cần deploy static và verify production thật 3 viewport (mobile/tablet/desktop) để chốt PASS UI theo AGENTS.
- Đối chiếu mockup: bản trước khi fix chữ bị vỡ nên **không khớp mockup**; sau hotfix text đã đồng bộ lại ngữ nghĩa, bước còn lại là verify ảnh giao diện production sau deploy.
- Đã deploy static production `shophuyvan-analytics` sau hotfix font Flash Auto: version `6ff15461-2440-4d0e-8d4c-e778166feec3`; Wrangler upload đúng 1 asset `apps/fe/js/dashboard/flash-auto.js`.
- Đã kiểm auth deploy bằng `npx wrangler whoami` với profile `DuAn_shophuyvan-analytics`, account Cloudflare `efe50fab1dd644088d681fb14a4838ae`, email `nghiemchihuy@gmail.com`.
- Cần user hard refresh (`Ctrl+F5`) tại `/pages/promotions.html` để nhận JS mới; nếu còn cache cũ thì mở kèm query `?v=flash-fontfix-20260530`.
### 2026-05-30 - Promotions Flash Auto UI parity theo mockup (operational board)

- Đã refactor UI tab `Khuyến mãi sàn > Flash Sale tự động` theo layout mockup mới: 1 trang cài đặt vận hành với 2 cột (trái: Trạng thái chạy/Luật áp giá/Lịch chạy; phải: Shop áp dụng/Trạng thái endpoint/Lịch sử gần nhất) và thanh action đáy `Lưu cài đặt`, `Làm mới`, `Chạy ngay`.
- Đã bỏ tab con `Cài đặt/Lịch chạy/Lịch sử` trong Flash Auto để gộp về một màn duy nhất đúng mockup.
- Đã bổ sung tương tác theo mockup: day chips chọn ngày chạy, nút `Dừng khẩn` (set `enabled=0` cho các shop đang chọn), lịch sử gần nhất hiển thị ngay trên panel phải.
- File đã sửa đúng scope:
  - `apps/fe/pages/promotions.html`
  - `apps/fe/css/flash-auto.css`
  - `apps/fe/js/dashboard/flash-auto.js`
- Đã tăng cache-bust production asset lên `20260530e` cho `promotions.html`.
- Check pass:
  - `node --check apps/fe/js/dashboard/flash-auto.js`
  - `node --check apps/fe/js/dashboard/promotions-tabs.js`
  - `node scripts/test-ui-design-system-guard.mjs --files apps/fe/pages/promotions.html apps/fe/css/flash-auto.css apps/fe/js/dashboard/flash-auto.js`
  - Size guard: `apps/fe/js/dashboard/flash-auto.js = 29790` bytes (<30KB)
- Chưa verify screenshot production bằng Playwright MCP trong phiên này do extension MCP không attach được; cần verify trực tiếp trên profile `E:\codex-chrome-profiles\shophuyvan-test` sau deploy static.
### 2026-05-30 - Python runner tab dedupe + compact browser windows for TikTok/Shopee no-API

- Scope done: updated Python automation runtime in `E:\shophuyvan-python-automation` to stop tab growth and keep browser windows compact at top for TikTok `0909128999` and Shopee no-API `khogiadungcona`.
- Core changes:
  - `oms_python/features/reports/run_report_jobs.py`: added per-feature task tab key (`platform:shop:action_type`), tab reuse, duplicate task-tab auto close, and compact window override for two no-API profiles.
  - `oms_python/features/chat/automation_browser.py`: strengthened task-page reuse and duplicate close for chat helper tabs; reuse existing marketplace tab before opening a new one.
  - `oms_python/ui/tabs/oms_radar_tab.py`: auto chat sync now requests compact window (`620x480`) at top, with per-platform left offset, while keeping `reuse_browser=true`.
  - locked compact mode in TikTok chat scan so runtime no longer auto-expands viewport to `1380x860` when running compact window mode.
- Verification run now:
  - `python -m py_compile` passed for all 3 edited files.
  - ECC hook `before-edit` passed before code edits.
  - Live chat-sync verify pass for both shops:
    - TikTok `0909128999`: `window_bounds.applied=true`, `left=0`, `top=0`, `width=620`, `height=480`, `viewport.reason=compact_mode_locked`.
    - Shopee no-API `khogiadungcona`: `window_bounds.applied=true`, `left=780`, `top=0`, `width=620`, `height=480`.
  - Tab count before/after re-run stayed stable:
    - TikTok CDP `9331`: `2 -> 2` page tabs.
    - Shopee CDP `9332`: `2 -> 2` page tabs.
  - RAM snapshot (Chrome process working set):
    - TikTok profile pid `33472`: ~`97.2 MB`.
    - Shopee profile pid `39048`: ~`102.7 MB`.
- Deploy status: not deployed in this turn (Python local runner/runtime change only; no Worker/static deploy executed yet).
- Remaining checks required before claiming production pass:
  - run one long-duration scheduler cycle (>=30 minutes) to confirm tab stability over repeated loops.
- Endpoint status:
  - checked/used this turn: local helper `/chat-sync` and report worker runtime behavior only (no new marketplace endpoint wiring).
  - permission missing: none found in this scope.
  - endpoint not available: none newly identified.
### 2026-05-30 - Promotions overview UI parity theo mockup (Khuyến mãi sàn)

- Đã thay renderer của tab `Khuyến mãi sàn` sang layout vận hành theo mockup: hàng KPI 4 card, bảng `Ưu tiên xử lý ngay`, panel `Bộ lọc nhanh`, panel `Trạng thái endpoint`, cụm tab dưới (`Flash Sale tự động / Voucher / Combo / Mua kèm / Lazada`), khối `Lịch ... sắp tới` và bảng `Lịch sử chạy`.
- Đã đổi tab con mặc định ở `promotions.html` sang `Khuyến mãi sàn` (overview), Flash Auto là tab cài đặt riêng thứ hai.
- File sửa đúng scope:
  - `apps/fe/js/dashboard/promotions-render.js` (rewrite UTF-8 sạch, bỏ render detail cũ khỏi màn overview)
  - `apps/fe/js/dashboard/promotions-actions.js` (thêm action `switch-overview-module`)
  - `apps/fe/css/dashboard/promotions-page.css` (style parity cho hero, decision grid, endpoint cards, bottom tabs/cards)
  - `apps/fe/pages/promotions.html` (default tab + cache-bust)
- Check pass:
  - `node --check` cho `promotions-render.js`, `promotions-actions.js`, `promotions-tabs.js`, `flash-auto.js`
  - `node scripts/test-ui-design-system-guard.mjs --files apps/fe/pages/promotions.html apps/fe/css/dashboard/promotions-page.css apps/fe/js/dashboard/promotions-render.js apps/fe/js/dashboard/promotions-actions.js`
  - Size guard: `promotions-render.js=15897`, `promotions-actions.js=14882`, `flash-auto.js=29790` (<30KB)
- Deploy static production `shophuyvan-analytics` version `9112930b-642b-4d4c-a0d3-8440f64ccb06`.
  - Uploaded assets: `/pages/promotions.html`, `/css/dashboard/promotions-page.css`, `/js/dashboard/promotions-actions.js`, `/js/dashboard/promotions-render.js`.
- Readback production pass:
  - `/pages/promotions` có asset version `promotions-20260530f`.
  - Tab con mặc định: `Khuyến mãi sàn` active, có tab `Flash Sale tự động` bên cạnh.

### 2026-05-30 - Promotions/Flash Auto UI hotfix round 2 (khử co dọc + khử stretch sai)

- Root cause production theo ảnh người dùng:
  - `promo-overview` vẫn để grid nhiều cột nên khi render shell mới bị bóp KPI thành cột dọc hẹp.
  - `flash-auto-status-grid` stretch theo chiều cao card bên cạnh làm khối `Trạng thái hiện tại` và `Dừng khẩn` bị dư khoảng trống.
- Đã sửa đúng scope:
  - `apps/fe/css/dashboard/promotions-page.css`
    - `promo-overview` về 1 cột cho shell mới.
    - điều chỉnh breakpoint `promo-decision-grid`, `promo-hero-kpis`, `#promoQuickFilterHost .promo-filterbar` để không ép cột quá sớm.
  - `apps/fe/css/flash-auto.css`
    - thêm `align-items:start` cho `flash-auto-status-grid`.
    - thêm `align-self:start` cho `flash-auto-emergency`.
    - giảm `min-height` switch trạng thái để bỏ khoảng trắng.
- Agent/UI-UX review song song:
  - Explorer agent `019e780b-4158-7061-bf2a-0103069604b4` audit selector-level mismatch trước khi chốt patch vòng 2.
- Check pass:
  - `node scripts/test-ui-design-system-guard.mjs --files apps/fe/css/dashboard/promotions-page.css apps/fe/css/flash-auto.css`
  - ECC hook `before-edit`, `after-edit`, `before-final`: pass.
- Deploy static production:
  - `shophuyvan-analytics` version `7d3c2bb7-f60f-4e68-a875-4181449b2f16`.
  - Uploaded assets: `/css/dashboard/promotions-page.css`, `/css/flash-auto.css`.
- Verify production thật (profile `E:\codex-chrome-profiles\shophuyvan-test`, CDP `127.0.0.1:9333`):
  - đã chụp lại overview + flash sau deploy ở desktop/mobile:
    - `E:\shophuyvan-runtime\verification\promotions-mockup\promotions-overview-desktop-v2.png`
    - `E:\shophuyvan-runtime\verification\promotions-mockup\promotions-flash-desktop-v2.png`
    - `E:\shophuyvan-runtime\verification\promotions-mockup\promotions-overview-mobile-v2.png`
  - KPI không còn bó dọc; khối `Trạng thái chạy` không còn stretch rỗng.
- Còn mở:
  - Giao diện vẫn chưa 1:1 hoàn toàn với mockup ở lớp sidebar/topbar/iconography tổng thể; cần lượt refactor UI shell riêng nếu chốt yêu cầu “giống tuyệt đối”.

## 2026-05-30 16:05 ICT - Promotions UI/UX parity hotfix (desktop + tablet + mobile split)

- Scope: `pages/promotions.html`, `css/dashboard/promotions-page.css`, `css/flash-auto.css`, `js/dashboard/promotions-render.js`, `js/dashboard/flash-auto.js`.
- Root issues from production verify:
  - Cột `Thao tác` trong bảng `Ưu tiên xử lý ngay` bị bó hẹp, nút bị cắt.
  - `Lịch sử chạy` xuất hiện cuộn ngang ở desktop/tablet.
  - Flash Auto settings bị kéo giãn không cân (khối trống lớn ở `1. Trạng thái chạy`).
  - Mobile/tablet ép table desktop nên khó thao tác.
- Fix implemented:
  - Desktop: tăng canvas + rebalance decision grid, khóa chiều rộng cột thao tác, thu gọn nút thao tác.
  - Tablet/mobile: tách riêng danh sách card cho `Ưu tiên xử lý ngay` + `Lịch sử chạy`; ẩn table desktop dưới `1200px`.
  - Flash Auto: ép `align-items/start`, giảm chiều cao switch, thêm max-height scroll cục bộ cho shop/history để tránh kéo toàn trang.
  - Đồng bộ label nút chạy ngay về `Chạy ngay (có xác nhận)`.
- Deploy production static:
  - `fe280c72-ed19-42f4-a443-fe8aa4d1f007`
  - `9967e04d-26c4-42e2-9b8f-b14ba9052c56`
  - `db0b72af-af20-479a-a54a-576de96553f6` (latest)
  - Uploaded assets latest: `/pages/promotions.html`, `/css/dashboard/promotions-page.css`.
- Verify thực tế (profile `E:\codex-chrome-profiles\shophuyvan-test`, CDP `127.0.0.1:9333`, production URL):
  - Desktop 1919x1017: `E:\shophuyvan-runtime\verification\promotions-mockup\promotions-overview-desktop-after-fix-v3.png`, `...\promotions-flash-desktop-after-fix-v3.png`.
  - Tablet 1024x1280: `E:\shophuyvan-runtime\verification\promotions-mockup\promotions-overview-tablet-after-fix-v3.png`, `...\promotions-flash-tablet-after-fix-v3.png`.
  - Mobile 390x844: `E:\shophuyvan-runtime\verification\promotions-mockup\promotions-overview-mobile-after-fix-v3.png`, `...\promotions-flash-mobile-after-fix-v3.png`.
- Rule check:
  - PASS: thao tác hiện đủ nút (không cắt), lịch sử chạy không còn cuộn ngang desktop, flash status không còn khối trống vô lý, mobile/tablet thao tác theo card.
  - OPEN: chưa đạt pixel-perfect 1:1 toàn bộ shell/topbar/sidebar so với mockup mục tiêu; cần phase polish riêng nếu chốt strict parity.


## 2026-05-30 16:13 ICT - Flash Auto single-screen balance + device-mode split

- User rule enforced:
  - Cài đặt và thiết lập trên cùng một màn hình.
  - Không để vùng trống lớn lệch mật độ dữ liệu.
  - Tách mode mobile vs laptop/desktop (không ép chung một layout).
- UI change:
  - `flash-auto.js`: chuyển `Trạng thái endpoint` + `Lịch sử gần nhất` ra `flash-auto-bottom-grid` dưới cụm setup/shop để lấp đầy canvas và giữ một màn cài đặt liền mạch.
  - `flash-auto.css`: thêm layout split rõ ràng theo viewport:
    - Desktop (`>=980`): 2 cột setup/shop + hàng dưới endpoint/history.
    - Mobile (`<980`): stack dọc, bỏ max-height nội bộ, action footer full-width.
- Deploy production static:
  - Version `080afc88-0b62-437f-ac12-e3d289623c8c`.
  - Uploaded assets: `/pages/promotions.html`, `/css/flash-auto.css`, `/js/dashboard/flash-auto.js`.
- Verify real browser with profile `E:\codex-chrome-profiles\shophuyvan-test`:
  - Desktop screenshot: `E:\shophuyvan-runtime\verification\promotions-mockup\promotions-flash-desktop-single-screen-v4.png`.
  - Mobile screenshot: `E:\shophuyvan-runtime\verification\promotions-mockup\promotions-flash-mobile-single-screen-v4.png`.
- Result:
  - Không còn khối trống lớn bên trái.
  - Cấu hình + thiết lập nằm cùng màn hình flash-auto.
  - Mobile và desktop đã đi hai mode bố cục khác nhau.


## 2026-05-30 16:20 ICT - Flash Auto compact density pass (desktop/laptop)

- User feedback: nút/chữ quá to, phải cuộn dọc nhiều khi chỉnh cài đặt.
- Update compact mode desktop/laptop:
  - Giảm typography và control density trong `flash-auto` (button/field/day-chip/switch/section padding).
  - Rút chiều cao danh sách shop và lịch sử bằng scroll nội bộ (`shop-list`/`history-list`) để giảm cuộn toàn trang.
  - Màn rộng (`>=1480`): cột trái chia 2 nửa cho `Luật áp giá` + `Lịch chạy`, giữ `Trạng thái chạy` full-row.
- Deploy production static:
  - Version `0c580517-8f3f-4665-a55b-0421ea366753`.
  - Uploaded assets: `/pages/promotions.html`, `/css/flash-auto.css`.
- Verify thực tế profile `E:\codex-chrome-profiles\shophuyvan-test`:
  - Desktop 1919x1017: `E:\shophuyvan-runtime\verification\promotions-mockup\promotions-flash-desktop-compact-v5.png`.
  - Laptop 1366x900: `E:\shophuyvan-runtime\verification\promotions-mockup\promotions-flash-laptop-compact-v5.png`.


## 2026-05-30 16:38 ICT - Remove shop selection mode, keep only Bật/Tắt per shop

- User decision: automation theo shop, không cần cơ chế chọn shop thủ công.
- Updated Flash Auto shop panel:
  - Bỏ các action `Chọn tất cả`, `Giữ 1 shop`, `Đã chọn áp dụng`, `Sửa/Đang sửa`.
  - Mỗi shop chỉ còn đúng 1 hành động `Bật` hoặc `Tắt`.
  - Rule hiển thị rõ: `Bật shop nào thì shop đó chạy tự động`.
- Save/Run/Pause logic:
  - `Lưu cài đặt`, `Dừng khẩn`, `Chạy ngay` áp dụng theo `shop hiện tại`.
  - Toggle Bật/Tắt của từng shop cập nhật thẳng qua `/api/discounts/flash-auto/settings` và refresh lại panel.
- Deploy production static:
  - Version `f068acbd-8143-4bdb-8b5a-0e7d2317d1b7`.
  - Uploaded assets: `/pages/promotions.html`, `/css/flash-auto.css`, `/js/dashboard/flash-auto.js`.
- Verify screenshot:
  - `E:\shophuyvan-runtime\verification\promotions-mockup\promotions-flash-desktop-toggle-only-v6.png`.


## 2026-05-30 16:53 ICT - Flash Auto simplification per latest UI feedback

- User feedback enforced:
  - `Dừng khẩn` thu nhỏ và cân với control còn lại trong `Trạng thái chạy`.
  - Shop list dùng một công tắc duy nhất (không tách badge + nút riêng).
  - `Trạng thái endpoint` giữ ở cụm dưới nhưng dàn ngang full-width, cỡ chữ/khối nhỏ hơn.
- Implemented:
  - `flash-auto.js`: render shop action as single `flash-auto-shop-toggle` (`Đang bật/Đang tắt`).
  - `flash-auto.css`: compact sizing for emergency button and endpoint cards; bottom grid switched to one-column with endpoint full-width before history; reduced typography.
- Deploy production static:
  - Version `8bc4ac60-f885-4bf5-bc07-9bd3eebcfcad`.
  - Uploaded: `/pages/promotions.html`, `/css/flash-auto.css`, `/js/dashboard/flash-auto.js`.
- Verify screenshot:
  - `E:\shophuyvan-runtime\verification\promotions-mockup\promotions-flash-desktop-toggle-endpoint-v7.png`.


## 2026-05-30 17:05 ICT - Flash Auto balance pass (fill right panel + move action buttons into schedule block)

- User feedback enforced:
  - Kéo khung `Shop áp dụng và chỉnh sửa` dài xuống để cân với khối trái.
  - Đưa 3 nút thao tác (`Lưu cài đặt`, `Làm mới`, `Chạy ngay`) lên đúng vùng trống dưới `3. Lịch chạy`.
  - Giữ công tắc shop ở phía phải mỗi dòng shop.
- Implemented:
  - `apps/fe/js/dashboard/flash-auto.js`
    - Chuyển action bar vào trong section `3. Lịch chạy` (không tách card thao tác riêng).
    - Cấu trúc shop row thành 1 hàng: thông tin shop bên trái, công tắc bên phải (`flash-auto-shop-head` + `flash-auto-shop-actions`).
  - `apps/fe/css/flash-auto.css`
    - `flash-auto-schedule` đổi sang flex column, action bar bám đáy section để lấp khoảng trống.
    - `flash-auto-right-col` và section con kéo `height:100%`, shop-list co giãn để khung phải cân chiều cao.
    - Tinh chỉnh layout action buttons dạng 3 cột cân nhau trên desktop, stack trên mobile.
  - `apps/fe/pages/promotions.html`
    - Bump cache-bust lên `flash-auto-20260530r` cho CSS/JS.
- Check pass:
  - `node --check apps/fe/js/dashboard/flash-auto.js`
  - `node scripts/test-ui-design-system-guard.mjs --files apps/fe/js/dashboard/flash-auto.js,apps/fe/css/flash-auto.css,apps/fe/pages/promotions.html`
  - ECC hook `after-edit`: pass.
- Deploy production static:
  - Version `08b02e35-7af4-4dda-9c51-00138462da58`.
  - Uploaded assets: `/pages/promotions.html`, `/css/flash-auto.css`, `/js/dashboard/flash-auto.js`.

## 2026-05-30 17:35 ICT - Zalo chat dedupe + sender direction + auto-reply sync gate fix (local tool)

- Scope and files changed (local Zalo tool):
  - `E:\tool zalo\server.js`
  - `E:\tool zalo\src\services\zaloAutomation.js`
  - `E:\tool zalo\src\services\shophuyvanChatBridge.js`
- Core fixes:
  - Dedupe stability:
    - Không còn drop toàn bộ `automation-sync` trước merge; giữ lịch sử đã sync và merge incrementally.
    - Signature chuẩn hóa theo `text + dateText + atText + attachments` (không dựa `at=nowIso()`), giảm false-new mỗi vòng quét.
    - Thêm reconcile theo content-key để sửa lệch chiều `in/out` cho message đã có thay vì append duplicate mới.
  - Sender/receiver direction:
    - Scraper Zalo bổ sung rule infer direction theo class (`me`, outgoing/incoming hints) + vị trí bubble + avatar fallback.
    - Bổ sung lọc nhiễu time/date-only (ví dụ `08:21`, `19:01`) để không coi timestamp node là tin nhắn mới.
  - Auto-reply integration:
    - `syncAutomationAccount` đổi vòng recent conversations sang `allowAutoReply=true` (trước đây bị hardcode `false` nên không chạy auto-reply ở phần hội thoại mới nhất).
- Runtime verification thực tế (local helper at `http://127.0.0.1:8788`):
  - `/api/automation/slots`: 2 slot CDP online (`9241`, `9242`), `autoSendEnabled=true`, `aiRuntimeReady=true`.
  - Sync lặp hội thoại `2816808833991810235`:
    - Lần 1: `messages_synced=3`, `saved_messages=3` (repair dữ liệu cũ), `chat_core_push.saved_messages=8`.
    - Lần 2: `messages_synced=3`, `saved_messages=0`, `chat_core_push.saved_messages=0`, `skipped_duplicates=8`.
    - Kết luận: quét lặp không tăng thêm tin nhắn sau khi đã chuẩn hóa.
  - Sync hội thoại `3714274722232243239`:
    - Lần 1/2 đều `saved_messages=0` ở vòng lặp thứ hai, `timeLikeCount=0`.
    - Tail message có đủ `in/out` xen kẽ đúng ngữ cảnh hội thoại.
  - Auto-reply state readback:
    - `GET /api/accounts/{id}/customers` cho thấy account AI có `lastAutoReplyAttemptAt/lastAutoReplyAt` cập nhật, gồm bản ghi mới ngày `2026-05-30` (không còn bị khóa ở vòng recent sync).
- Notes:
  - Service đang chạy cổng `8788` (fallback port), không phải `8794`.

## 2026-05-31 01:10 ICT - Zalo duplicate-content hotfix verified on both logged-in profiles

- Root cause verified against Zalo Web CDP `9241/9242`: local helper retained aliases for the same visible bubble when date metadata changed from missing/relative to explicit; older scraper aliases could also carry the wrong `in/out` direction.
- Fixed local helper:
  - `E:\tool zalo\server.js`: canonical date labels, reconcile stored aliases against the current DOM snapshot, retain only current `direction + text + visible minute + attachments`; serialize sync-history, background scan and send operations per Zalo account.
  - `E:\tool zalo\src\services\zaloAutomation.js`: after opening a thread, verify the active Zalo Web conversation id/title before scraping; abort the sync if Zalo Web has not switched to the requested thread.
  - `E:\tool zalo\src\services\shophuyvanChatBridge.js`: payload compaction prefers explicit-date rows, removes index-based identity fallback, and never re-dates an undated historical bubble as today.
- Fixed Chat Core read-model:
  - `apps/chat-worker-api/src/core/zalo-legacy-dedupe-core.js`: hide legacy `zalo_local_browser` aliases when an explicit-date canonical row exists. No broad D1 cleanup was run.
- Runtime/deploy:
  - Local helper restarted at `http://127.0.0.1:8794`, PID `49548`; Zalo Chrome remains visible/headful.
  - Chat Worker `shophuyvan-chat-api` deployed separately on account `39cf0fe9b3eda88bda53e369770cabeb`, version `7d11d783-edd8-4bf1-9ca6-8d58eb80eda6`.
- Real verification:
  - `Shop Huy Vân / Kỹ Thuật Hoàng Nhân`: Zalo DOM `2` bubbles; local store compacted `4 -> 2`; repeated sync returned `saved_messages=0`, `skipped_duplicates=2`; production read-model returns `2` Zalo rows plus `1` internal draft.
  - `Nghiem Chi Huy / Cậu Hoàng`: Zalo DOM `15` bubbles; local store compacted `37 -> 15`; repeated sync returned `saved_messages=0`, `skipped_duplicates=15`; production read-model returns exactly `15` rows with corrected sender direction and visible timestamps.
  - Forced race test: two concurrent sync-history requests for `Cậu Hoàng` both returned `messages_synced=15`, `saved_messages=0`, `skipped_duplicates=15`; no cross-thread content was persisted.
  - Bounded dirty-data cleanup: snapshot `E:\shophuyvan-runtime\verification\zalo-dedupe-20260531\d1-race-contamination-before-delete.json`, then deleted exactly `2` D1 rows that had entered `Cậu Hoàng` before the race lock. SQL readback returned `remaining=0`. Local snapshot: `store-before-race-cleanup.json`.
  - Production UI opened through ShopHuyVan Chrome profile CDP `9333`: `Kỹ Thuật Hoàng Nhân` renders `3` rows (`2` Zalo + `1` internal draft), `Cậu Hoàng` renders exactly `15` Zalo rows. Screenshot: `E:\shophuyvan-runtime\verification\zalo-dedupe-20260531\chat-cau-hoang-production-after-race-lock.png`.
- Open:
  - Legacy alias rows remain physically stored in D1 for audit safety. UI/read-model no longer exposes them. Any broader physical D1 cleanup must remain a separate snapshot + dry-run + bounded-batch task.

## 2026-05-31 09:01 ICT - Zalo explicit-date dedupe cleanup + production local-network gate

- Fixed Chat Core and local helper dedupe for the same Zalo bubble when attachment ids, missing date labels, `date_unknown` aliases or stale sender direction differ:
  - `apps/chat-worker-api/src/core/zalo-legacy-dedupe-core.js`
  - `E:\tool zalo\src\services\shophuyvanChatBridge.js`
  - `E:\tool zalo\src\services\zaloAutomation.js`
  - `E:\tool zalo\server.js`
- Added regression tests:
  - `scripts/test-zalo-legacy-dedupe.mjs`
  - `E:\tool zalo\scripts\test-shophuyvan-chat-bridge.mjs`
  - `E:\tool zalo\scripts\test-zalo-automation-page-selection.mjs`
- Verified both actual visible/headful Zalo Chrome profiles:
  - CDP `9241`: `E:\shophuyvan-python-automation\profiles\browser\Zalo_Shop_Huy_Van_0909128999`
  - CDP `9242`: `E:\shophuyvan-python-automation\profiles\browser\Zalo_Nghiem_Chi_Huy_0848881111`
- Bounded dirty-data cleanup for `Đặng Kim Dũng / 1025381407093463190`:
  - Snapshot before cleanup: `E:\shophuyvan-runtime\zalo-tool\d1-zalo-dang-kim-dung-before-cleanup-20260531-082611.log`
  - Deleted exactly `6` verified legacy message aliases and `1` empty legacy conversation alias.
  - D1/API/UI readback now returns exactly `2` ordered rows: inbound image `15:51 27-05`, outbound `quên` `15:52 27-05`.
  - Repeated direct helper sync: `messages_synced=2`, `saved_messages=0`, `skipped_duplicates=2`.
- Deploy:
  - Chat Worker `shophuyvan-chat-api` version `6e4636bc-a3bb-4763-ac6b-c9ff96041967`.
  - Static `shophuyvan-analytics` version `235eb070-6f07-4d40-9673-d691a490d6a9`.
- Local helper:
  - Running `http://127.0.0.1:8794`, PID `28460`.
  - Added safe preflight diagnostics and Local Network Access response headers.
  - Frontend Zalo wrapper sends `targetAddressSpace: 'local'`.
- Open:
  - Chrome production tab still needs operator to grant the Local Network Access permission prompt once. Direct local route passes, but production UI click must be rechecked after the permission is granted.
  - Broad cleanup of other legacy `zalo_nka` aliases remains a separate snapshot + dry-run + bounded-batch audit.

## 2026-05-31 12:47 ICT - Zalo Cậu Hoàng wrong-thread source fix verified

- Fixed the remaining source of Zalo duplicate and wrong-thread contamination for `Cậu Hoàng / 3714274722232243239`:
  - `E:\tool zalo\src\services\shophuyvanChatBridge.js`: only pushes rows that have both an explicit visible date and a visible time; undated or hidden-time aliases are skipped instead of being re-dated as today.
  - `E:\tool zalo\src\services\zaloAutomation.js`: send/sync now asserts the active Zalo conversation id before scraping and again before sending, so a scheduler switch cannot type or scrape into the wrong thread.
  - `apps/chat-worker-api/src/core/zalo-legacy-dedupe-core.js`: read-model hides no-time aliases when a timed same-content row exists and collapses no-time-only aliases.
  - `apps/chat-worker-api/src/core/conversation-core.js` and `apps/chat-worker-api/src/core/message-merge.js`: platform message id dedupe is now shop-scoped to avoid cross-shop merge collisions.
- Bounded dirty-data cleanup:
  - D1 snapshot saved at `E:\shophuyvan-runtime\zalo-tool\cau-hoang-d1-dirty-snapshot-20260531-123404.json`.
  - Deleted exactly `25` known bad Cậu Hoàng aliases containing `date_unknown`, `time_unknown`, `_pos_`, `STORE DETAILING` or stale `in_18:16_nld2zw`.
  - After local store cleanup, deleted the reinserted `STORE DETAILING` rows in two bounded passes (`4` rows then `2` rows). Final D1 readback has `badHits=0`.
  - Local helper store backup saved at `E:\shophuyvan-runtime\zalo-tool\store-before-cau-hoang-clean-20260531T053642Z.json`; removed exactly `2` wrong `STORE DETAILING` rows from account key `acc_d290997981634d3ea3f2f24b6f3ef3b3:3714274722232243239`.
- Real Zalo profile verification:
  - CDP `9242` profile `E:\shophuyvan-python-automation\profiles\browser\Zalo_Nghiem_Chi_Huy_0848881111` opened the actual Zalo Web thread `Cậu Hoàng NGƯỜI LẠ Không có nhóm chung`.
  - Direct DOM tail showed the real conversation text (`E bóc zôi a`, `Ok a`, `E k tbáo`, `dạ vậy khách hoàn...`) and `hasStoreDetailing=false`.
- Runtime and deploy:
  - Chat Worker `shophuyvan-chat-api` deployed on account `39cf0fe9b3eda88bda53e369770cabeb`, version `2fae05ce-a97e-4557-9547-28b10e86cea4`.
  - Local Zalo helper is running at `http://127.0.0.1:8794`, PID `22828`, `scanIntervalSeconds=30`, `autoSendEnabled=true`, `aiRuntimeReady=true`, scheduler next-run data active.
  - Zalo slots are connected: CDP `9241` `Zalo_Shop_Huy_Van_0909128999`, CDP `9242` `Zalo_Nghiem_Chi_Huy_0848881111`.
- Final readback:
  - Exact helper sync for `Cậu Hoàng`: `messages_synced=15`, `saved_messages=0`, `chat_core_push.saved_messages=0`, `skipped_duplicates=15`.
  - Production API after sync: exactly `15` rows, `badHits=0` for `date_unknown|time_unknown|_pos_|STORE DETAILING|0908094790`; tail rows remain shop `18:14`, shop `18:15`, customer `18:16 Ok a`.
  - Stability after one scheduler interval: still `15` rows, `badHits=0`, tail unchanged.
  - Production UI through ShopHuyVan Chrome profile CDP `9333` shows selected `Cậu Hoàng`, status `Đồng bộ ổn`, date group `29/5/2026`, no `STORE DETAILING`, no `date_unknown/time_unknown/_pos_`.
- Endpoint report:
  - No official Zalo chat API endpoint was added in this scope.
  - Used existing local browser-helper plus Chat Worker `/api/chat/browser-helper/push`.
  - No `api_permission_missing`, `token_scope_missing` or `endpoint_not_available` was introduced.
- Open:
  - Broader security hardening for the local helper auth/CORS and auto-send policy remains a separate phase; this turn fixed and verified the wrong-thread/duplicate Zalo data bug.

## 2026-05-31 13:55 ICT - Zalo local helper origin guard + loopback bind

- Continued from `docs/handoff/LATEST.md` after the Cậu Hoàng duplicate/wrong-thread fix.
- Fixed a handoff encoding issue by rewriting `docs/handoff/LATEST.md` with ASCII-safe text; no new mojibake markers in the handoff.
- Hardened local Zalo helper:
  - Added `E:\tool zalo\src\services\localHelperSecurity.js` for origin allowlist and local helper CORS/PNA handling.
  - `E:\tool zalo\server.js` now echoes only allowed origins instead of `Access-Control-Allow-Origin: *`.
  - Allowed origins: ShopHuyVan production `https://shophuyvan-analytics.nghiemchihuy.workers.dev`, `https://shophuyvan-analytics.pages.dev`, and loopback origins.
  - Disallowed origins return `403 origin_not_allowed` before route handling and no longer receive `Access-Control-Allow-Private-Network`.
  - JSON request body is capped by `MAX_JSON_BODY_BYTES` (default `256KB`); oversized requests return `413 body_too_large`.
  - Helper now binds to `127.0.0.1` by default; LAN bind requires explicit `ZALO_HELPER_ALLOW_LAN=1` or `ZALO_HELPER_HOST`.
- Runtime:
  - Restarted only the node helper listener on port `8794`; did not close or kill Chrome/Zalo profiles.
  - Current listener: `127.0.0.1:8794`, PID `20284`, `autoSendEnabled=true`, `aiRuntimeReady=true`, CDP slots `9241/9242` connected.
- Verification:
  - Allowed production preflight to `/api/shophuyvan-chat/sync-history`: `204`, `Access-Control-Allow-Origin=https://shophuyvan-analytics.nghiemchihuy.workers.dev`, `Access-Control-Allow-Private-Network=true`.
  - Evil origin preflight: `403`, no `Access-Control-Allow-Origin`, no `Access-Control-Allow-Private-Network`.
  - Oversized body test: `413 body_too_large`.
  - Scheduler completed after restart with `lastError=""`.
  - Production API for `Cậu Hoàng` remains stable: `count=15`, `badHits=0`.
- Tests:
  - `node --check server.js`
  - `node --check src\services\localHelperSecurity.js`
  - `npm run test:bridge`
- Endpoint report:
  - No official Zalo marketplace endpoint was added.
  - Existing local browser-helper routes remain the path for Zalo social chat.
  - No `api_permission_missing`, `token_scope_missing` or `endpoint_not_available` was introduced.
- Open:
  - Full token auth for browser-origin production UI is not enabled because a frontend-held secret would not be secure. Current mitigation is origin allowlist + loopback bind + body limit.
  - `E:\tool zalo\src\services\zaloAutomation.js` remains a legacy large file and should be split in a separate refactor, not during production helper hardening.







### 2026-05-31 - Video Center responsive split (mobile/tablet/desktop) + homepage external link

- `Phạm vi`: frontend UI-only cho `Trung tâm video | ShopHuyVan`.
- `Đã sửa`:
  - `apps/fe/css/video/video-dashboard/library-management.css`
  - `apps/fe/css/video/video-dashboard/analysis-upload.css`
  - `apps/fe/css/video/video-dashboard/cards-search.css`
  - `apps/fe/pages/dashboard_video.html` (thêm liên kết ra trang chủ `https://shophuyvan.vn`)
- `Chuẩn responsive đã áp dụng`:
  - Tablet tách riêng `760-1079px` cho Library/Analysis.
  - PC tách riêng `>=1080px` cho bảng grid lớn và ẩn nhãn mobile lặp.
  - Cards/Search tab switch tablet tách 3-4 cột, PC ép 7 cột một dòng.
- `Deploy`: chưa deploy trong lượt này.
- `Verify`:
  - Hook bridge pass: `before-edit`, `after-edit`.
  - Verify browser production/local 3 viewport: **chưa chạy được** do thiếu Playwright extension trong Chrome profile mặc định của môi trường Codex.
- `Endpoint report`:
  - Không thêm endpoint mới, không đổi adapter/API.
  - Không phát sinh `api_permission_missing`, `token_scope_missing`, `endpoint_not_available`.
- `Còn mở`:
  - Cần verify click-flow thật trên mobile/tablet/desktop sau khi môi trường browser có extension hoặc có profile CDP sẵn.

### 2026-05-31 - ADS sidebar quick access: Trang chủ + Trung tâm video

- `Phạm vi`: UI-only tại `apps/fe/pages/ads.html`.
- `Đã sửa`:
  - Đưa `🏠 Trang chủ` (link `../index.html`) lên dòng đầu sidebar.
  - Thêm mục `🎬 Trung tâm video` (link `dashboard_video.html`) ngay đầu menu để thao tác nhanh.
  - Bỏ mục cũ `⬆️ Import` để tránh nhãn sai.
- `Deploy`: chưa deploy trong lượt này.
- `Verify`: chưa verify production click-flow do chưa chạy browser production trong lượt này.
- `Endpoint report`: không thêm endpoint mới, không phát sinh `api_permission_missing` / `token_scope_missing` / `endpoint_not_available`.

### 2026-05-31 - Home quick access add Video card

- `Phạm vi`: UI-only tại `apps/fe/index.html` và `apps/fe/js/dashboard-home.js`.
- `Đã sửa`:
  - Thêm thẻ `Trung tâm video` vào khu `Truy cập nhanh` trên trang chủ.
  - Link trực tiếp `pages/dashboard_video.html` để thao tác nhanh.
  - Bump cache-bust `dashboard-home.js?v=home-hub-20260531b` để tránh cache cũ.
- `Deploy`: sẽ deploy static sau bước chỉnh.
- `Endpoint report`: không thêm endpoint mới, không phát sinh `api_permission_missing` / `token_scope_missing` / `endpoint_not_available`.

### 2026-05-31 - Fix Video page no-action runtime

- `Phạm vi`: UI-only tại `apps/fe/js/video/video-dashboard.js`.
- `Nguyên nhân`: loader chunk path sai (`./video/dashboard/...`) nên browser gọi URL `/js/video/video/dashboard/...` (sai), script lỗi ngay từ chunk đầu.
- `Đã sửa`: đổi về đúng path `./dashboard/...` để map chuẩn `/js/video/dashboard/...`.
- `Kỳ vọng`: trang `dashboard_video.html` bind lại đầy đủ tab, filter, nút đồng bộ và thao tác thư viện.
- `Deploy`: pending static deploy.
- `Endpoint report`: không thêm endpoint mới, không phát sinh `api_permission_missing` / `token_scope_missing` / `endpoint_not_available`.

### 2026-05-31 - Video Dashboard redesign responsive (base-shell/cards/library/analysis/multi-shop)

- `Phạm vi`: UI-only, không đổi class/id/data-attribute, không đổi backend.
- `Đã sửa`:
  - `apps/fe/css/video/video-dashboard/base-shell.css`
  - `apps/fe/css/video/video-dashboard/cards-search.css`
  - `apps/fe/css/video/video-dashboard/library-management.css`
  - `apps/fe/css/video/video-dashboard/analysis-upload.css`
  - `apps/fe/css/video/multi-shop.css`
  - `apps/fe/pages/dashboard_video.html`
  - `apps/fe/js/video/dashboard/overview-library-render.js`
- `Điểm chính`:
  - Topbar/subtab mobile-first rõ hơn, subtab scroll ngang mobile, desktop chia đều.
  - KPI/card/status/pill tăng phân cấp thị giác.
  - Library row zebra + hover + filter layout responsive.
  - Analysis/queue/table mobile card-mode + desktop table-mode.
  - Multi-shop card/box cảnh báo rõ hơn.
  - Trend table thêm `data-label` để render card-mode mobile.
- `Deploy`: pending static deploy.
- `Endpoint report`: không phát sinh endpoint mới; không có `api_permission_missing`, `token_scope_missing`, `endpoint_not_available`.

### 2026-05-31 - Video page cleanup: bỏ subtab Shop/API + thu nhỏ video đóng gói

- `Phạm vi`: UI-only tại `apps/fe/pages/dashboard_video.html`, `apps/fe/js/video/dashboard/multi-shop-state.js`, `apps/fe/css/video/video-dashboard/cards-search.css`.
- `Đã sửa`:
  - Bỏ subtab `Shop / API` khỏi thanh subtab video.
  - Bỏ toàn bộ 2 block `data-video-subview="shop"` để màn hình gọn, tập trung thao tác vận hành.
  - Chuẩn hóa JS subtab: nếu URL cũ còn `view=shop` thì fallback về `library`.
  - Đổi nhãn link thành `Trang chủ` và đưa lên đầu cụm action trên cùng.
  - Thu nhỏ video ở tab `Kho video đóng gói` (`max-height` nhỏ hơn + giới hạn chiều rộng + desktop 2 cột).
- `Deploy`: pending static deploy.
- `Verify`:
  - Hook bridge `after-edit` pass.
  - `node --check apps/fe/js/video/dashboard/multi-shop-state.js` pass.
  - Verify production click-flow desktop/tablet/mobile: pending bước deploy + mở trang thật.
- `Endpoint report`: không thêm endpoint mới, không phát sinh `api_permission_missing`, `token_scope_missing`, `endpoint_not_available`.

## 2026-05-31 - Video Upload Queue Subrequest Hotfix + Font/Mojibake Guard

### Đã xong
- Sửa backend video queue để giảm rủi ro `Too many subrequests` khi cron upload:
  - `uploadShopeeVideoFromBuffer` hỗ trợ `syncAfterPost=0`, `pollMaxRounds`, `maxExternalSubrequests`.
  - Queue run mặc định chạy 1 job/lượt, truyền budget subrequest và chuẩn hóa message lỗi cho vận hành.
- Giữ nguyên luồng endpoint Shopee Video cho upload/edit/delete/list/detail (không thêm nguồn dữ liệu thứ hai).
- Sửa frontend log queue:
  - Chuẩn hóa text mojibake trong `cleanText`.
  - Nếu lỗi cũ vẫn bể mã hóa thì hiển thị fallback dễ đọc cho vận hành.
- Deploy production:
  - Worker: `huyvan-worker-api` version `6a2afcef-e1d7-429e-be4b-7f91f3d6da02`
  - FE static worker: `shophuyvan-analytics` version `505947e8-1833-41c6-bfe3-dbdacab22a0f`

### Đã kiểm
- `node --check` pass:
  - `apps/worker-api/src/routes/video/shopee-sync.js`
  - `apps/worker-api/src/routes/video/multi-queue-run.js`
  - `apps/fe/js/video/dashboard/foundation-utils.js`
  - `apps/fe/js/video/dashboard/multi-shop-render.js`
- API production verify:
  - `GET /api/video/upload-queue` (shop `chihuy2309`) trả `status=ok`, đọc được 4 job log.
  - `POST /api/video/upload-queue/run` với `dry_run=1` trả `status=ok`.
  - `POST /api/video/upload-queue/run` với `max_external_subrequests=45` chạy không lỗi hệ thống.
  - `POST /api/video/delete` dry-run (shop `chihuy1984`) trả `status=ok`.
  - `POST /api/video/edit` dry-run trên video đã post trả `blocked` đúng guard Shopee.

### Còn mở
- Job lỗi cũ trước hotfix vẫn còn trong lịch sử queue; cần tạo job mới để xác nhận hoàn toàn không tái diễn subrequest limit.
- Một số log cũ đã bị mojibake từ trước; UI đã có fallback hiển thị an toàn nhưng không thể phục hồi 100% nguyên văn.

### 2026-05-31 - Non-API TikTok/Shopee order-status recovery check (live runtime)

- Time: 2026-05-31 19:50 +07
- Scope: kiểm tra lại lỗi "không cập nhật đơn và trạng thái" cho 2 shop non-API 	iktok/0909128999 và shopee/khogiadungcona.
- Live runtime check:
  - http://127.0.0.1:8765/health: adar_running=true, eport_worker_running=true, scheduler enabled.
  - Readback GET /api/orders xác nhận source_updated_at mới:
    - TikTok: fresh tới khoảng 2026-05-31 18:28:21.
    - Shopee: fresh tới khoảng 2026-05-31 19:25:15.
- Queue/lock handling:
  - Requeue lại job Shopee fail do profile_lock_busy bằng PATCH /api/jobs/{id} về queued (không tạo nguồn dữ liệu thứ hai).
  - Đã verify job 7634 chạy lại thành công completed sau requeue.
- Runtime hotfix đã áp dụng (python automation):
  - File: E:\shophuyvan-python-automation\oms_python\platforms\shopee\orders\parser_chitiet.py.
  - Guard page.bring_to_front() bằng try/except để tránh crash cứng do Playwright tab-focus glitch.
- Open items:
  - Các job Shopee requeue còn lại (7639, 7662, 7663, 7664, 7665, 7666, 7669) đang queued và chờ worker quét tuần tự vì có batch TikTok sync_finance đứng trước trong FIFO.
  - Tiếp tục theo dõi tới khi hết queued/fail cho cụm này.

### 2026-06-01 - Zalo helper/profile autostart recovery

- Scope: local Zalo social chat helper only; no Chat Worker or main Worker deploy.
- Root cause found: after machine/session restart there was no ShopHuyVan Zalo autostart entry for the local helper or the two CDP Chrome profiles. Windows Startup only had the normal `Zalo.lnk`; no Scheduled Task matched `Zalo|ShopHuyVan|shophuyvan|Chat`.
- Runtime restored manually:
  - Helper: `http://127.0.0.1:8794`, PID `25252`.
  - Profile 1: `E:\shophuyvan-python-automation\profiles\browser\Zalo_Shop_Huy_Van_0909128999`, CDP `9241`, PID `24728`.
  - Profile 2: `E:\shophuyvan-python-automation\profiles\browser\Zalo_Nghiem_Chi_Huy_0848881111`, CDP `9242`, PID `16552`.
- Added startup launcher:
  - Script: `E:\tool zalo\start-zalo-all.ps1`.
  - Launcher health-checks existing helper ports `8794..8814`; if no healthy Zalo helper is found, it starts `server.js` from `8794` with `PORT_FALLBACK_ATTEMPTS=20`.
  - Windows Startup shortcut: `C:\Users\Admin\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup\ShopHuyVan Zalo Helper.lnk`.
  - Shortcut target: `powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "E:\tool zalo\start-zalo-all.ps1"`.
- Verification:
  - `start-zalo-all.ps1` PowerShell parse passed.
  - Re-running the launcher while ports are busy did not duplicate processes.
  - `GET http://127.0.0.1:8794/api/automation/slots` returned both slots `ok=true`, scheduler `running=true`, `lastError=""`, `autoSendEnabled=true`, `aiRuntimeReady=true`.
- Endpoint report: no official Zalo endpoint added; existing local browser-helper remains the runtime path. No `api_permission_missing`, `token_scope_missing`, or `endpoint_not_available` introduced.

### 2026-06-01 - Zalo auto-reply disabled after irrelevant reply

- Scope: local Zalo helper safety only; no Cloudflare deploy.
- Incident: Zalo Web thread `COOP FOOD / 7794638045251300480` received an irrelevant AI reply about `Băng Keo Hai Mặt... K112` at `2026-06-01T03:14:35Z`.
- Source identified:
  - Auto-send was enabled by helper env `ZALO_AUTO_SEND_ENABLED=1`.
  - Both live Zalo accounts had `account.ai.enabled=true`.
  - Global auto rules had `autoWelcomeOnNewFriend=true` and `autoGreetOnFirstInbound=true`.
  - The bad product context came from local Zalo tool knowledge, not Chat Worker: `E:\tool zalo\data\training\shophuyvan-products.md/json` and `E:\tool zalo\data\store.json`, product `shv-prd-1935`.
  - Product text contains noisy imported/admin text such as `khogiadunghcm.com`, `Sửa Giá bán`, `Tìm Kiếm Tồn Kho`, so AI produced irrelevant output.
- Immediate safety changes:
  - Patched `E:\tool zalo\start-zalo-all.ps1` to start helper with `ZALO_AUTO_SEND_ENABLED=0`.
  - Restarted only exact local helper PID; did not close Chrome/Zalo profiles.
  - Disabled AI on accounts `Shop Huy Vân` and `Nghiem Chi Huy` through `/api/accounts/:id/ai`.
  - Disabled auto welcome/first-inbound greeting through `/api/settings`.
- Verification: `/api/automation/slots` now returns `autoSendEnabled=false`, both live accounts `aiEnabled=false`, scheduler `lastError=""`, two Zalo CDP slots still connected.
- Open: before enabling Zalo auto-send again, clean/approve the knowledge base and add a UI review gate/countdown. Until then Zalo should be sync-only/manual-send.
### 2026-06-01 - Chat/Zalo settings đưa lên website, khóa local AI auto-reply và sửa thông báo

- Đã gom phần vận hành Zalo local vào page production `/settings`: tab `Kênh chat` hiện cổng helper, scheduler, lần quét cuối/kế tiếp, 2 profile Zalo, chu kỳ quét tự động, trạng thái AI từng tài khoản và nút `Tắt tự trả lời Zalo`.
- Đã sửa local helper `E:\tool zalo`: thêm cờ `ZALO_LOCAL_AI_REPLY_ENABLED` mặc định tắt, giữ `ZALO_AUTO_SEND_ENABLED=0`, `/api/automation/slots` trả `localAiReplyEnabled` + `autoRules` để website đọc trạng thái thật.
- Restart đúng PID helper cũ `30652`; helper mới chạy PID `14900` ở `http://127.0.0.1:8794`.
- Readback helper sau restart: `autoSendEnabled=false`, `localAiReplyEnabled=false`, `autoWelcomeOnNewFriend=false`, `autoGreetOnFirstInbound=false`, 2 account Zalo `aiEnabled=false`, 2 profile Chrome Zalo đang mở ở `9241`, `9242`.
- Đã sửa thông báo khi trang Chat đang mở: `apps/fe/js/dashboard/chat/data.js` tạo title dạng `Sàn/Kênh · Người gửi`, payload kèm `channel_label`, `sender_name`, `message_text`, `conversation_id`.
- Đã làm rõ tab từ khóa: UI đổi thành `Từ khóa sàn`, ghi rõ chỉ áp dụng Shopee/Lazada/TikTok; Zalo/Facebook dùng chính sách social riêng.
- Deploy production static: `/settings` version `9af0b5c7-50d3-4e12-8638-0bb5c3adca00`; Chat notification cache-bust version `3c192c55-2ff0-4fba-8f88-f2da43ce47b7`. Không deploy Worker chính; không deploy Chat Worker.
- Verify production thật bằng Chrome profile `E:\codex-chrome-profiles\shophuyvan-test` qua CDP `9333`: `/settings` đọc được helper local, `Chế độ an toàn đang bật`, bấm `Tắt tự trả lời Zalo` và `Lưu Zalo helper` đều pass; mobile `390x844`, tablet `768x1024`, desktop `1440x900` đều `overflowX=false`.
- Verify `/pages/chat-cskh.html`: module version `chat-notice-20260601a`, giả lập tin Zalo trả toast `Zalo · Khach Test Zalo: ok test noi dung thong bao`.
- Test pass: `node --check apps/fe/js/dashboard/chat-settings.js`, `node --check E:\tool zalo\server.js`, `node scripts/test-ui-design-system-guard.mjs`, `node --check` toàn bộ `apps/fe/js/dashboard/chat/*.js`, scoped mojibake scan sạch, Hook bridge `before-edit` + `after-edit` pass.
- Cleanup còn lại: chưa xóa vật lý local knowledge `E:\tool zalo\data\training\shophuyvan-products.*` vì còn là bằng chứng sự cố COOP FOOD và route/UI legacy local vẫn có caller; runtime auto-reply local đã bị khóa. Refactor/xóa hẳn KB local cần phase cleanup riêng có audit caller + backup.
- Endpoint/marketplace: không thêm endpoint sàn mới; shop có API giữ luồng Chat Core/Worker hiện tại; Zalo/Facebook là social local/bridge riêng, không dùng keyword policy chat sàn.
### 2026-06-01 - Settings Zalo AI có nơi cấu hình cách trả lời và train AI

- Vấn đề user báo: card `Tự trả lời Zalo` chỉ hiện trạng thái bật/tắt, không có nơi cấu hình nội dung trả lời hoặc dữ liệu train AI; trước đó local Zalo từng tự gửi nội dung không liên quan.
- Đã sửa frontend `/settings.html` tab `Kênh chat`:
  - Đưa card `Tự trả lời Zalo` lên đầu tab để người vận hành thấy ngay.
  - Thêm form cấu hình: chế độ dùng AI, cách xưng hô/giọng trả lời, câu chào bạn mới, câu khi khách nhắn trước, nội dung train AI riêng cho Zalo, thời gian chờ nếu sau này bật tự gửi.
  - Nút chính mới: `Lưu cách trả lời & train AI Zalo`.
  - Đổi nhãn kỹ thuật cũ sang nhãn vận hành: `Kết nối Zalo`, `đã nối Chat chung`, `AI trên máy`, `Tự gửi`.
- Luồng lưu:
  - Cấu hình lưu tập trung vào Chat settings field `zalo_reply_config`.
  - Nội dung train đồng thời được đưa vào `ai_learning_notes` dưới mục `Zalo - cách trả lời riêng` để AI hiện tại có thể đọc.
  - Mirror mẫu `welcome_template` và `first_inbound_template` sang Zalo local `/api/settings`, nhưng vẫn ép `autoWelcomeOnNewFriend=false` và `autoGreetOnFirstInbound=false`.
- Deploy static production `shophuyvan-analytics`: version `8593b41f-a008-4950-9bd1-460a9522c742`.
- Test/check pass:
  - `node --check apps/fe/js/dashboard/chat-settings.js`.
  - `node scripts/test-ui-design-system-guard.mjs`.
  - Scoped mojibake scan cho `settings.html`, `chat-settings.js`, `chat-settings.css` không có match.
  - ECC hook `before-edit` và `after-edit` pass.
- Production verification bằng Chrome profile/CDP `9333`:
  - Mở `https://shophuyvan-analytics.nghiemchihuy.workers.dev/settings.html`, tab `Kênh chat`.
  - Lưu thử cấu hình Zalo AI tiếng Việt, toast trả `Đã lưu cách trả lời và train AI Zalo. Tự gửi vẫn đang khóa an toàn.`
  - Readback Chat Worker: `zalo_reply_config` có tiếng Việt đúng, `ai_learning_notes` có mục `Zalo - cách trả lời riêng`.
  - Readback Zalo local: `autoSendEnabled=false`, `localAiReplyEnabled=false`, `autoWelcomeOnNewFriend=false`, `autoGreetOnFirstInbound=false`, 2 tài khoản Zalo connected và AI account off.
  - Responsive production: desktop `1366x900`, tablet `820x1180`, mobile `390x844` đều `overflowX=false`; card đầu tiên trong tab là `Tự trả lời Zalo`.
- Còn mở:
  - AI auto-send Zalo vẫn chưa bật theo chủ đích an toàn. Bước sau chỉ bật khi có rule duyệt, countdown hủy gửi và test hội thoại thật.
  - Bảng `Trạng thái kênh` còn vài lỗi lịch sử của Shopee/no-API ngoài phạm vi Zalo AI settings; không xử lý trong phase này.

### 2026-06-02 - Order push iPhone deploy + production readback

- Scope: Order push/OMS/Chat notification only; khong them endpoint marketplace moi.
- Code da deploy:
  - `apps/fe/js/modules/oms-notifications.js`: OMS page tu dang ky PushSubscription qua Chat Worker, co guard iPhone standalone/Home Screen, co targeted push test cho dung thiet bi hien tai.
  - `apps/fe/js/dashboard/chat/notifications.js`: chan iPhone Safari mode va hien ro loi test push khi dang ky nen khong pass.
  - `apps/fe/pages/oms-dashboard.html`: them manifest + apple web-app meta/icon de Home Screen app cua OMS du dieu kien push tren iPhone.
  - `apps/chat-worker-api/src/core/push-notification-core.js`: reject subscription thieu `p256dh/auth`, bo branch APNs header custom, normalize payload order/chat truoc khi gui.
  - `apps/chat-worker-api/src/routes/notifications.js`: route test/subscription dung payload normalize moi.
  - `apps/worker-api/src/routes/marketplace-chat/index.js`: order change bridge sang `POST /api/chat/notifications/test` tren Chat Worker.
- Deploy production:
  - Chat Worker `shophuyvan-chat-api`: `21ac05fa-e55b-4f47-965f-6e180f11958c`.
  - Worker chinh `huyvan-worker-api`: `ff4b0c8a-39dd-4b80-93e1-7ee93d914285`.
  - Static `shophuyvan-analytics`: `6d15c647-e43e-44ab-b2c8-34a598d4fc8c`.
- Production readback pass:
  - `GET https://shophuyvan-chat-api.zacha030596.workers.dev/api/chat/notifications/status` -> HTTP 200, `subscriptions=6`.
  - `POST https://shophuyvan-chat-api.zacha030596.workers.dev/api/chat/notifications/test` voi payload order smoke -> `sent=6`, `failed=0`.
  - `POST /api/chat/notifications/subscribe` voi subscription thieu key -> HTTP 400, `error_code=missing_push_keys`.
  - Static asset production da co marker moi: `CHAT_PUSH_API`, `requiresStandaloneIosPush`, `sendOmsPushTest`, `manifest.webmanifest`, `apple-mobile-web-app-capable`.
  - Route legacy tren Worker chinh van dung 410 cho `/api/chat/*`; push production di qua Chat Worker rieng.
- Browser verification production:
  - Da mo profile `E:\codex-chrome-profiles\shophuyvan-test` qua CDP `9333`.
  - Production OMS redirect ve `pages/login?next=...`; profile nay chua co session dang nhap hop le trong luot verify nen khong the click-flow sau login.
- Con mo / blocker that su:
  - Chua verify lock screen/banner/notification center tren iPhone vat ly trong Home Screen mode.
  - Chua trigger 1 order event that tren production de doc readback end-to-end tu OMS Core -> Worker chinh -> Chat Worker -> thiet bi.
  - Neu user dang test bang Safari tab thuong tren iPhone, push ngoai man hinh van khong hien; can Add to Home Screen va cap quyen Notification trong iOS Settings.

### 2026-06-02 - Zalo send bridge + same-minute ordering verified

- Scope: Zalo social chat only; no official Zalo API endpoint added. Runtime path remains local browser-helper `E:\tool zalo` -> Chat Worker `/api/chat/browser-helper/push`.
- Root causes fixed:
  - Production FE sent local helper requests with `targetAddressSpace: 'local'`; Chrome returned `corsError=InvalidLocalNetworkAccess` on `POST /api/shophuyvan-chat/send`, causing UI `Failed to fetch`.
  - Zalo helper treated any thread containing `NGUOI LA` + `Gui ket ban` as blocked even when the real `#richInput` composer was visible/editable, so valid replies were rejected.
  - Zalo same-minute rows only had minute-level timestamps; Chat Core sorted ties by id, which made messages appear reversed/random.
- Code/runtime changed:
  - `apps/fe/js/dashboard/chat/api.js`: removed `targetAddressSpace`, kept helper port fallback `8794..8799` and longer Zalo helper timeout.
  - `E:\tool zalo\src\services\zaloAutomation.js`: only blocks stranger/friend-request threads when Zalo also has a hard cannot-send signal or no editable composer.
  - `E:\tool zalo\src\services\shophuyvanChatBridge.js`: applies deterministic millisecond offsets from DOM order before pushing same-minute Zalo messages.
  - `E:\tool zalo\server.js`: keeps `clientTempId` on local bridge sent messages.
  - `E:\tool zalo\start-zalo-tool.bat`: default port `8794`, auto-send and local AI reply default off.
  - `scripts/test-zalo-helper-order.mjs`: regression test for same-minute message ordering.
- Deploy/runtime:
  - Static `shophuyvan-analytics` deployed version `c93fb9dc-562d-4fc4-b9a6-b88f763f4b92`.
  - Local helper restarted by stopping only PID on port `8794`; current listener PID `27096`.
  - `/api/automation/slots`: 2 Zalo profiles connected at CDP `9241/9242`, scheduler running, `autoSendEnabled=false`, `localAiReplyEnabled=false`.
- Verification:
  - Production asset readback: `api.js` no longer contains `targetAddressSpace` and still contains `ZALO_HELPER_PORTS`.
  - Production UI `/pages/chat-cskh`: active conversation `Thanh / 2372356367431295040`; clicked real `Gửi` with content `ok`.
  - Real Zalo Web CDP `9242`: thread `Thanh NGƯỜI LẠ Không có nhóm chung` has editable composer and shows outgoing `ok` at `17:55`, status `Đã nhận`.
  - Chat Core readback: last row is shop `ok`, `status=synced`, `created_at=2026-06-02T10:55:00.019Z`, `platform_message_id=zalo_local_2372356367431295040_out_02/06/2026_17:55_2cyo`.
  - Production UI DOM readback shows `Shop Nghiem Chi Huy ok 17:55 02-06 ... Đã đồng bộ`.
  - `Suleo Vina / 6975238965683388769` same-minute `11:52` rows render in DOM/Core order: shop `việt nam bán nhiêu vậy`, shop `đặt về chắc hơn 700k`, customer `1 củ`, `Vậy thôi`, `Để mua luôn`, `Tại cái hộp nó cũ quá`, with offsets `.043Z` to `.048Z`.
- Test/check pass:
  - `node scripts/test-zalo-helper-order.mjs`.
  - `node --check apps/fe/js/dashboard/chat/api.js`.
  - `node --check apps/fe/js/dashboard/chat-zalo.js`.
  - `node --check E:\tool zalo\src\services\shophuyvanChatBridge.js`.
  - `node --check E:\tool zalo\server.js`.
  - `node --check E:\tool zalo\src\services\zaloAutomation.js`.
  - ECC hook `before-edit` and `after-edit` pass.
- Còn mở:
  - AI auto-send Zalo vẫn tắt theo chủ đích an toàn; chỉ bật lại sau khi có duyệt/cancel/countdown và bộ nhớ trả lời đã được kiểm.
  - Các duplicate lịch sử thật đã gửi nhiều lần trước đó không bị xóa trong lượt này; nếu cần dọn phải có snapshot và bounded cleanup riêng.
### 2026-06-03 - Chat AI Agent phase 2 (structured evidence before staff send)

- Phạm vi: `apps/chat-worker-api/src/core/ai-agent-evidence-core.js`, `apps/chat-worker-api/src/core/ai-policy-core.js`, `apps/chat-worker-api/src/core/ai-settings-defaults.js`, `apps/fe/js/dashboard/chat/render.js`, `apps/fe/js/dashboard/chat/events.js`, `apps/fe/pages/chat-cskh.html`, `scripts/test-chat-ai-policy.mjs`, `docs/chat-ai-agent-core-integration-plan.md`.
- Vấn đề tiếp nối:
  - Phase 1 đã lưu được `chat_ai_agent_config` trên website nhưng backend gợi ý AI chưa đọc cấu hình này như một contract riêng.
  - Nhân viên cần thấy nguồn/rủi ro trước khi gửi, không để AI tự trộn `Nguồn/Căn cứ/Rủi ro` vào nội dung nháp cho khách.
- Đã sửa:
  - Thêm `ai-agent-evidence-core.js` để chuẩn hóa `chat_ai_agent_config`, ép `raw_conversation_learning=false`, build `agent_evidence_lines`, `agent_source_labels`, `agent_risk_labels`, `agent_handoff_reason`.
  - `suggestChatReply` đọc cấu hình agent, đưa instruction block vào prompt, lưu evidence/risk vào `suggestion.prompt_context`, trả top-level `agent_evidence`, và ép `policy_status=needs_review`, `auto_send=false` khi cần nhân viên duyệt.
  - Làm sạch nháp AI: nếu model trả dòng mở đầu `Nguồn/Căn cứ/Rủi ro/Source/Evidence/Risk` thì không đưa các dòng này vào composer; nếu bị strip hết thì dùng câu fallback an toàn.
  - Chat UI render thêm nguồn bật, căn cứ đã dùng, phần thiếu và lý do cần duyệt từ `prompt_context`; khi blocked vẫn render lại evidence.
  - Cache-bust Chat UI sang `chat-ai-evidence-20260603a`.
- Kết quả kỹ thuật:
  - `node --check` pass cho `ai-agent-evidence-core.js`, `ai-policy-core.js`, `ai-settings-defaults.js`, `render.js`, `events.js`.
  - `node scripts/test-chat-ai-policy.mjs` pass.
  - `node scripts/test-chat-ai-context.mjs` pass.
  - ECC hook `before-edit`, `after-edit` pass.
- Deploy:
  - Chat Worker riêng `shophuyvan-chat-api` version cuối `4b08df34-187f-4690-8e5a-7250ac9ebcb7`, account `39cf0fe9b3eda88bda53e369770cabeb`.
  - Static `shophuyvan-analytics` version `fb62add1-fe62-42b6-9b2b-a7cfa4fe4929`, account `efe50fab1dd644088d681fb14a4838ae`.
  - Không deploy Worker chính `huyvan-worker-api`.
- Verify production:
  - `POST https://shophuyvan-chat-api.zacha030596.workers.dev/api/chat/ai/suggest` trả `policy_status=needs_review`, `agent_mode=suggest_only`, `agent_handoff_required=true`, `agent_handoff_reason=Chưa khớp được đơn hàng với hội thoại`, `auto_send=false`, `provider=gemini`, `ai_status=active`.
  - Mở production `pages/chat-cskh.html?v=chat-ai-evidence-20260603a`, bấm `Gợi ý AI`: khung evidence hiển thị nguồn/căn cứ/lý do cần duyệt; toast nhắc đọc căn cứ trước khi gửi; không bấm nút `Gửi`.
  - Kiểm desktop/tablet/mobile bằng Chrome profile `E:\codex-chrome-profiles\shophuyvan-test`: evidence/composer/send button hiện, không tràn ngang.
- Endpoint report:
  - Đã kiểm/đã dùng: `GET/POST /api/chat/settings`, `POST /api/chat/ai/suggest`.
  - Thiếu quyền/token: không phát sinh.
  - Không có endpoint: không phát sinh.
  - Fallback: không dùng Seller Center fallback; nếu Gemini trả nội dung không đạt thì fallback nháp an toàn trong Chat Worker.
- Còn mở:
  - Phase 3: thêm vòng học từ câu trả lời đã được nhân viên duyệt/gửi, có loại bỏ dữ liệu riêng tư.
  - Zalo auto-send vẫn chưa bật; chỉ xem xét khi có source evidence, countdown, cancel và audit log production.
### 2026-06-03 - Chat AI Agent phase 3 (approved learning + private-data redaction)

- Phạm vi: `apps/chat-worker-api/src/core/ai-knowledge-core.js`, `apps/chat-worker-api/src/core/ai-learning-sanitize-core.js`, `apps/chat-worker-api/src/routes/ai.js`, `apps/chat-worker-api/src/routes/settings.js`, `apps/chat-worker-api/src/index.js`, `apps/chat-worker-api/src/core/ai-policy-core.js`, `apps/chat-worker-api/wrangler.toml`, `apps/fe/settings.html`, `apps/fe/js/dashboard/chat-settings.js`, `apps/fe/js/dashboard/chat-settings-knowledge.js`, `apps/fe/js/dashboard/chat/events.js`, `apps/fe/js/dashboard/chat/render.js`, `apps/fe/css/dashboard/chat-settings.css`, `scripts/test-chat-ai-approved-learning.mjs`.
- Vấn đề user yêu cầu:
  - AI/Zalo từng trả lời sai ngữ cảnh; cần đưa nội dung train và cách trả lời về một trang Settings thay vì cấu hình rải rác.
  - Bộ nhớ AI không được học thẳng hội thoại thô hoặc dữ liệu riêng của khách; chỉ học từ câu trả lời đã được nhân viên duyệt/gửi thành công.
- Đã sửa:
  - Chat Worker mở rộng `ai_knowledge_base` bằng schema lazy migration: `intent`, `source_tags`, `status`, `suggestion_id`, `conversation_id`, `source_message_id`, `dedupe_key`, `pii_redacted_count`, `sanitization_summary`, `disabled_at`, `disabled_by`.
  - Thêm audit chuẩn `ai_learning_audit_logs`; route mới `GET /api/chat/ai/learning-audit`; route `PATCH /api/chat/ai/knowledge/:id` cho sửa/tắt/bật.
  - `saveKnowledgeEntry()` và `approveAiSuggestion()` đều đi qua sanitizer: ẩn SĐT, email, link, mã đơn/vận đơn dài, địa chỉ và private values trước khi lưu reusable memory.
  - `approveAiSuggestion()` chỉ lưu khi xác minh được tin khách nguồn và tin shop đã `sent`; không còn học trước khi gửi.
  - Settings `/settings` tab `AI` có khu `Bộ nhớ trả lời`: thêm/sửa/tạm tắt/bật lại/xóa, tìm kiếm, lọc trạng thái, xem audit gần nhất.
  - Chat UI đổi hành vi `Duyệt học`: không ghi memory trước; chỉ gọi approve sau khi tin trả lời của nhân viên đã gửi thành công.
  - `CHAT_AI_MODE` của Chat Worker giữ `suggest_only`; Zalo auto-send không được bật trong phase này.
- Kết quả kỹ thuật:
  - `node scripts/test-chat-ai-approved-learning.mjs` pass.
  - `node scripts/test-chat-ai-policy.mjs` pass.
  - `npm run check` trong `apps/chat-worker-api` pass.
  - `node scripts/test-ui-design-system-guard.mjs` pass.
  - `node --check` pass cho các file JS touched trong Chat Worker/FE.
  - File size chính còn dưới 30KB: `chat-settings.js` 29,226 bytes, `ai-knowledge-core.js` 26,670 bytes.
- Deploy:
  - Chat Worker riêng `shophuyvan-chat-api` version cuối `9bb26567-4ae8-4555-a964-e912e57a2f8d`, account `39cf0fe9b3eda88bda53e369770cabeb`.
  - Static `shophuyvan-analytics` version cuối `cf6539de-af91-4592-ae36-8e4c0b00adf8`, account `efe50fab1dd644088d681fb14a4838ae`.
  - Không deploy Worker chính `huyvan-worker-api`.
- Verify production:
  - Production API `GET /api/chat/ai/knowledge?include_disabled=true&limit=10000` và `GET /api/chat/ai/learning-audit?limit=100` pass.
  - Production Settings tab `AI` full-flow bằng Chrome headful: thêm entry test, ẩn dữ liệu riêng, tắt, bật lại, sửa nội dung, ghi audit `knowledge_created/disabled/enabled/updated`, xóa entry test và ghi `knowledge_deleted`.
  - Nội dung tiếng Việt qua UI/API giữ đúng Unicode; dữ liệu riêng trong test được đổi thành `[số điện thoại]`, `[liên kết]`, `[địa chỉ]`.
  - Responsive production desktop `1366x900`, tablet `820x1180`, mobile `390x844`: không tràn ngang, console error quan trọng = 0.
  - Screenshots kiểm thật: `.playwright-mcp/chat-ai-learning-desktop.png`, `.playwright-mcp/chat-ai-learning-tablet.png`, `.playwright-mcp/chat-ai-learning-mobile.png`.
- Endpoint report:
  - Đã kiểm/đã dùng: `GET/POST/PATCH/DELETE /api/chat/ai/knowledge`, `GET /api/chat/ai/learning-audit`, `GET/POST /api/chat/settings`.
  - Thiếu quyền/token: không phát sinh.
  - Không có endpoint: không phát sinh.
  - Fallback: không dùng Seller Center fallback; đây là Chat Worker/Core nội bộ.
- Còn mở:
  - AI status production hiện có thể rơi về fallback khi Gemini key lỗi hoặc hết quota; cần kiểm lại key trước khi đánh giá chất lượng gợi ý mới.
  - Zalo auto-send vẫn khóa theo chủ đích an toàn; Phase 4 chỉ mở nếu có countdown/cancel, source evidence, policy gate và audit send result.
### 2026-06-03 - Customer Database nhận dữ liệu khách từ Chat Core

- Phạm vi: `apps/chat-worker-api/src/core/customer-contact-bridge-core.js`, `apps/chat-worker-api/src/routes/customer-contacts.js`, `apps/chat-worker-api/src/core/message-merge.js`, `apps/chat-worker-api/src/index.js`, `apps/worker-api/src/core/customer/contacts-core.js`, `apps/worker-api/src/routes/customer/index.js`, `apps/fe/pages/customer-database.html`, `apps/fe/js/customer-database/customer-database.js`, `apps/fe/css/customer-database/customer-database.css`.
- Vấn đề user yêu cầu: nếu hội thoại Shopee/Lazada/TikTok/Zalo/Facebook có tên, số điện thoại hoặc địa chỉ thì phải lưu về file/trang `Khách hàng sàn` để có dữ liệu remarketing sau này, không để rời rạc trong Chat.
- Đã sửa:
  - Chat Worker thêm bridge khách hàng: chỉ lấy tin nhắn inbound của khách, có dấu hiệu SĐT hoặc địa chỉ, rồi forward sang Worker chính.
  - Worker chính thêm route nội bộ `POST /api/customers/marketplace/chat-ingest`; route yêu cầu secret nội bộ, không mở ghi public.
  - Customer Core thêm parser chat và vẫn dùng bảng chuẩn `marketplace_customer_contacts`; không tạo bảng khách hàng riêng cho Chat/Zalo/Facebook.
  - `mergeMessageIntoStore()` gọi bridge sau khi lưu message, nên webhook/polling/browser helper đều đi cùng một điểm nhập.
  - Thêm backfill an toàn `POST /api/chat/customer-contacts/backfill` để quét lại message cũ có SĐT/địa chỉ.
  - UI `/pages/customer-database.html` đọc Core như cũ, thêm filter Shopee/Zalo/Facebook và summary tách `Sàn TMĐT`, `Zalo/Facebook`, `Có địa chỉ`.
- Guard dữ liệu:
  - Chỉ lưu contact khi có dữ liệu khách đã reveal thật; không lưu masked `***` như plaintext.
  - Dữ liệu chat mặc định `consent_status=unknown`, `contact_status=not_contacted`; không tự coi việc khách gửi SĐT/địa chỉ là đồng ý remarketing.
  - Zalo/Facebook là social channel, không áp dụng restricted keyword policy của shop sàn cho việc lưu contact.
- Kết quả kỹ thuật local:
  - `node --check` pass cho Worker Customer route/core, Chat Worker bridge/route/index/message merge, FE Customer Database.
  - `node scripts/test-customer-contacts-core.mjs` pass.
  - `node scripts/test-chat-customer-contact-bridge.mjs` pass.
  - `node scripts/test-ui-design-system-guard.mjs` pass.
- Kết quả production:
  - Worker chính deploy `huyvan-worker-api` version `f4c7a8a5-4967-40db-96db-04dcff731ed6`.
  - Chat Worker deploy `shophuyvan-chat-api` version `cb3687af-78d1-4a0b-a78e-029898baaa42`.
  - FE static deploy `shophuyvan-analytics` version `15535d6e-d49f-4997-92ba-b51aaacb81d5`.
  - Public write guard pass: `POST /api/customers/marketplace/chat-ingest` không có secret trả `403`.
  - Backfill production pass: Zalo `scanned=80 matched=4 forwarded=4 failed=0`, Shopee `scanned=80 matched=22 forwarded=22 failed=0`, Lazada `scanned=17 matched=1 forwarded=1 failed=0`, TikTok/Facebook hiện `0` message match trong batch kiểm.
  - Customer summary production sau cleanup/backfill: `total=57`, `shopee_total=6`, `tiktok_total=48`, `lazada_total=1`, `zalo_total=2`, `facebook_total=0`, `with_phone=52`, `with_address=55`.
  - Zalo readback production còn đúng 2 contact hợp lệ theo conversation: `Thanh` (`0914963497`) và `Siêu Thị Điện Máy Thắng Hằng` (`0983771346`); các row business broadcast/wrong-conversation từ Zalo helper đã được lọc và cleanup scoped.
- Endpoint report:
  - Không thêm endpoint marketplace chính thức mới.
  - Đã dùng route nội bộ: Worker chính `POST /api/customers/marketplace/chat-ingest`, Chat Worker `POST /api/chat/customer-contacts/backfill`.
  - Shop có API/no-API giữ nguyên luồng hiện tại; Chat chỉ forward dữ liệu đã vào Chat Core.
  - Thiếu quyền/token: không phát sinh `api_permission_missing`, `token_scope_missing`, `endpoint_not_available` trong scope này.
- Deploy/verify: API production/backfill/readback đã pass; UI production `/pages/customer-database.html?v=customer-chat-core-20260603` đã kiểm desktop/tablet/mobile không tràn ngang và không console error.

### 2026-06-03 - Order push text tieng Viet cho OMS/iPhone

- Pham vi: chi sua text thong bao order push va OMS notification; khong them endpoint marketplace moi.
- Da sua:
  - apps/worker-api/src/routes/marketplace-chat/index.js: notifier uu tien display_status_vi va status_label_vi tu Order Core, fallback qua orderStatusLabel() cua status-core, va title/body push doi sang tieng Viet co dau.
  - apps/fe/js/modules/oms-notifications.js: OMS foreground/local notification uu tien display_status_vi va status_label_vi tu /api/orders/changes, khong tu render raw status tieng Anh nua.
- Deploy production:
  - Worker chinh huyvan-worker-api: fdc383b1-5b2b-4646-9807-b3164e3fe7bb.
  - Static shophuyvan-analytics: da3ed98b-157a-436d-97da-5c0b10a1348c.
  - Khong deploy lai Chat Worker trong luot nay.
- Verify da chay:
  - node --check pass cho apps/worker-api/src/routes/marketplace-chat/index.js va apps/fe/js/modules/oms-notifications.js.
  - Mock local notifyOrderSubscribers() cho row LOGISTICS_PACKAGED sinh payload: title OMS · Đơn 26060239WP76R2, body Đã đóng gói · shop phambich2312, status Đã đóng gói.
  - Node fetch production GET /api/orders/changes?limit=1 doc duoc display_status_vi Unicode that (Đã giao), xac nhan Order Core/read-model dang tra status tieng Viet co dau.
  - Fetch production asset js/modules/oms-notifications.js co marker displayStatusVi/statusLabelVi moi.
  - POST https://shophuyvan-chat-api.zacha030596.workers.dev/api/chat/notifications/test voi payload co dau Đã đóng gói · shop phambich2312 tra ok=true, sent=6, failed=0.
- Con mo:
  - Chua bam duoc 1 order event that tren iPhone vat ly de doc lai lock screen/banner/notification center sau fix text.
  - Chat Worker smoke da pass, nhung verify hinh anh ngoai man hinh iPhone van can thiet bi that.
### 2026-06-04 - External Shopee full-product API for prompt/image/video pipelines

- Scope: `apps/worker-api/src/features/shopee/api/product.js`, `apps/worker-api/src/core/external/shopee-product-core.js`, `apps/worker-api/src/routes/external/index.js`, `docs/facebook-crm-api.md`.
- Added authenticated External API endpoints:
  - `GET /api/external/shopee/products/full?shop=<shop>&limit=<n>&offset=<n>&item_status=NORMAL&include_metrics=true`
  - `GET /api/external/shopee/products/full/:itemId?shop=<shop>&include_metrics=true`
- Data source rule:
  - Shop API path only. Endpoint reads Shopee Open Platform directly via `get_item_list`, `get_item_base_info`, `get_model_list`, `get_item_extra_info`.
  - No Seller Center fallback for Shopee API shops.
- Response shape now includes prompt-ready fields:
  - `description`, `images`, `promotion_images`, `videos`, `models`, `attributes`, `brand`, `price_info`, `metrics`, `prompt_assets.all_image_urls`, `prompt_assets.prompt_text`.
- Auth:
  - Reuses External API key gate `Authorization: Bearer <API_KEY_FOR_FACEBOOK_CRM>` or `X-API-Key`.
- Endpoint report:
  - Checked/used: Shopee `/api/v2/product/get_item_list`, `/api/v2/product/get_item_base_info`, `/api/v2/product/get_model_list`, `/api/v2/product/get_item_extra_info`.
  - Missing permission/token: none in local code validation; production readback pending deploy.
  - Endpoint not available: none in this scope.
  - Fallback: none; direct Open Platform read for Shopee API shops only.
- Validation:
  - `node --check` pending in this section until run after patch.
- Deploy:
  - Pending.
