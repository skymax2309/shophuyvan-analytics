# Flash Sale run-now endpoint hotfix and production partial verify

- Status: needs_verification
- Updated: 2026-05-30T16:54:38.537Z
- Repo: E:\shophuyvan-analytics
- Source file: 20260530-235438-flashsale-run-now-hotfix.md

## Summary
- Read required AGENTS/guards/docs and resumed from promotions handoff before editing.
- Fixed Flash Auto FE shop selection + retry/polling logic in apps/fe/js/dashboard/flash-auto.js.
- Fixed wrapper request body consumption and SQL fallback/runtime risk in flash-auto backend files.
- Switched Flash Auto adapter from flashdeal endpoints to shop_flash_sale endpoints and adjusted create/add/get flow.
- Deployed Worker and static to production; run-batch no longer returns error_not_found for chihuy1984.

## Next Actions
- Verify promotions flash-auto UI on production desktop/tablet/mobile with profile E:/codex-chrome-profiles/shophuyvan-test.
- Trigger run-now from UI and confirm toast/history/readback align with API result (prepared or sent/verified depending auto_submit).
- If business expects live write immediately, confirm auto_submit=1 on target shop and rerun production check.
- Update scripts/test-promotions-ui.mjs expected script versions to restore regression gate.

## Files
- apps/fe/js/dashboard/flash-auto.js
- apps/worker-api/src/routes/discounts/flash-deal-endpoints.js
- apps/worker-api/src/routes/discounts/flash-auto-run.js
- apps/worker-api/src/routes/discounts/flash-auto-settings.js
- apps/worker-api/src/discounts/flash-auto-engine.js
- docs/PROJECT-CURRENT-STATE.md
- docs/marketplace-endpoint-master-checklist.md
- docs/marketplace-endpoint-progress.md

## Tests
- before-edit hook: pass
- node --check flash-auto.js/flash-deal-endpoints.js/flash-auto-engine.js/flash-auto-run.js/flash-auto-settings.js: pass
- after-edit hook: pass
- before-final hook: pass (first run)
- POST production /api/discounts/flash-auto/run/batch shop chihuy1984: error_not_found removed; now prepared with timeslot_id and items_submitted

## Verification
- Worker deploy versions: 0c7589cb-92f2-4d18-b24a-1f6e3d8865fb -> d3880c23-f932-45f8-a835-97005967a760 -> b70fe800-7b2d-420b-a96e-b5e52a1ea5e3
- Static deploy version: 61a5c7c1-00b8-4575-9fe8-b09a58701e95 (uploaded /js/dashboard/flash-auto.js)
- Production API readback verified; production UI viewport verification still missing due unavailable Playwright Chrome extension in current environment

## Blockers
- Cannot complete in-thread UI desktop/tablet/mobile verification because Playwright tool cannot launch without Chrome extension in this environment

## Resume Prompt
Continue "Flash Sale run-now endpoint hotfix and production partial verify" from this handoff. Re-read AGENTS.md, the relevant ShopHuyVan guards, and verify any drift-prone facts before editing or reporting pass.
