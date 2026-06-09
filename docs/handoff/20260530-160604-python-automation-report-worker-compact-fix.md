# Python automation report worker recovered + compact window lock

- Status: in_progress
- Updated: 2026-05-30T09:06:04.356Z
- Repo: E:\shophuyvan-analytics
- Source file: 20260530-160604-python-automation-report-worker-compact-fix.md

## Summary
- Re-read required guards/docs and resumed from docs/handoff/LATEST.md (20260530-154525...).
- Fixed report-worker crash causing non-chat tasks to stall: removed lifecycle kwargs collision (pages_count/first_page_url).
- Locked compact window for tiktok 0909128999 and shopee khogiadungcona at 620x480 in report flow, including login/fallback launch path.
- Added blank-tab cleanup in report tab selector to reduce tab growth.
- Live verify: report worker now runs non-chat jobs again (job 7110 completed, shopee run active).
- CDP readback confirms both windows stay at 620x480 with top positions and tab counts stable over 20s sample.

## Next Actions
- Let current shopee cycle finish and verify latest order/finance/label statuses move from partial_error to completed where eligible.
- Run one explicit /report-run for sync_finance and retry_label for both shops to validate non-chat branches after fix.
- If user still sees big window, capture exact timestamp + port and read CDP bounds at that moment.

## Files
- E:/shophuyvan-python-automation/oms_python/features/reports/run_report_jobs.py
- E:/shophuyvan-python-automation/oms_python/core/browser/lifecycle.py
- E:/bot-report-download-out.log
- E:/bot-report-download-err.log

## Tests
- python -m py_compile run_report_jobs.py lifecycle.py: pass
- POST http://127.0.0.1:8765/report-run (job_ids 7105,7106): worker restarted and non-chat runs observed
- CDP bounds check ports 9331/9332: both 620x480
- CDP sample t1->t2 (20s): pages_count stable (9331: 3->3, 9332: 2->2)

## Verification
- Non-chat execution verified via out log timestamps 15:58-16:02.
- Crash signature TypeError(lifecycle_message multiple values) no longer appears in new run interval.
- Window compact bounds verified live via Browser.getWindowBounds.

## Blockers
- No blocker. Remaining work is long-cycle validation for finance/label branches.

## Resume Prompt
Continue "Python automation report worker recovered + compact window lock" from this handoff. Re-read AGENTS.md, the relevant ShopHuyVan guards, and verify any drift-prone facts before editing or reporting pass.
