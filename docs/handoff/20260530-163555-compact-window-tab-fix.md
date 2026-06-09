# Fix compact browser size + tab growth for TikTok and khogiadungcona

- Status: done
- Updated: 2026-05-30T09:35:55.116Z
- Repo: E:\shophuyvan-analytics
- Source file: 20260530-163555-compact-window-tab-fix.md

## Summary
- Applied missing compact-lock paths in automation_browser.py so chat-send, chat-scan, and chat-warm all force per-shop compact bounds.
- Updated TikTok viewport guard to derive target from per-shop window config and keep compact mode locked instead of expanding to 1380x860.
- Updated tab selection to close duplicate same-platform pages before reuse to stop tab count growth.

## Next Actions
- Monitor one full scheduler cycle; if any oversized window reappears, capture timestamp and port for CDP trace.
- If needed, extend same compact override strategy to any additional no-API shop profiles.

## Files
- E:/shophuyvan-python-automation/oms_python/features/chat/automation_browser.py
- E:/shophuyvan-analytics/docs/handoff/LATEST.md

## Tests
- python -m py_compile E:/shophuyvan-python-automation/oms_python/features/chat/automation_browser.py : pass
- POST http://127.0.0.1:8765/chat-warm (tiktok 0909128999): window_bounds 620x480
- POST http://127.0.0.1:8765/chat-warm (shopee khogiadungcona): window_bounds 620x480
- POST http://127.0.0.1:8765/chat-sync for both shops: pass and bounds remain compact
- CDP snapshot ports 9331/9332: pages_count=1 each, bounds=620x480

## Verification
- Live CDP verify after sync: 9331 left=0 top=0 width=620 height=480 windowState=normal
- Live CDP verify after sync: 9332 left=630 top=0 width=620 height=480 windowState=normal
- 20s stability sample: tab count unchanged (1 -> 1 for both ports)

## Blockers
- None

## Resume Prompt
Continue "Fix compact browser size + tab growth for TikTok and khogiadungcona" from this handoff. Re-read AGENTS.md, the relevant ShopHuyVan guards, and verify any drift-prone facts before editing or reporting pass.
