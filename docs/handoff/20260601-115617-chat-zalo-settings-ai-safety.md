# Chat/Zalo settings centralized and local AI safety lock

- Status: done
- Updated: 2026-06-01T04:56:17.297Z
- Repo: E:\shophuyvan-analytics
- Source file: 20260601-115617-chat-zalo-settings-ai-safety.md

## Summary
- Moved Zalo helper operational settings into production /settings: scheduler, scan interval, profiles, safe-mode, auto-rule/account AI status, and disable auto-reply action.
- Locked local Zalo AI auto-reply behind ZALO_LOCAL_AI_REPLY_ENABLED=1 and autostart keeps both ZALO_AUTO_SEND_ENABLED=0 and ZALO_LOCAL_AI_REPLY_ENABLED=0.
- Restarted the exact local helper PID and verified the new helper response exposes localAiReplyEnabled=false, autoRules=false, account AI off, and both Zalo profiles connected.
- Updated Chat/CSKH notification title/data so in-page notifications include channel, sender, and message content.
- Deployed production static twice: settings version 9af0b5c7-50d3-4e12-8638-0bb5c3adca00 and chat-notice version 3c192c55-2ff0-4fba-8f88-f2da43ce47b7.

## Next Actions
- If continuing cleanup, audit and retire the local Zalo KB/routes only after backing up incident evidence and confirming no local UI caller still needs /api/kb/*.
- If user reports new Zalo duplicate/wrong-thread data, re-run logged-in Zalo profile checks at CDP 9241/9242 and Chat Core readback before editing again.

## Files
- apps/fe/settings.html
- apps/fe/css/dashboard/chat-settings.css
- apps/fe/js/dashboard/chat-settings.js
- apps/fe/js/dashboard/chat/data.js
- apps/fe/pages/chat-cskh.html
- apps/fe/js/dashboard/chat/*.js version query bump
- E:\tool zalo\server.js
- E:\tool zalo\start-zalo-all.ps1
- docs/PROJECT-CURRENT-STATE.md

## Tests
- node --check apps/fe/js/dashboard/chat-settings.js: pass
- node --check E:\tool zalo\server.js: pass
- node scripts/test-ui-design-system-guard.mjs: pass
- node --check apps/fe/js/dashboard/chat/*.js: pass
- Scoped mojibake scan: pass
- ECC hook before-edit/after-edit for E:\shophuyvan-analytics and E:\tool zalo: pass

## Verification
- Production /settings opened with ShopHuyVan Chrome profile via CDP 9333; Zalo safe-mode card showed helper 8794, scheduler running, both profiles open, local AI and auto-send off.
- Clicked Disable Zalo auto-reply on production /settings and read back all rules/accounts off.
- Clicked Save Zalo helper on production /settings and verified safe-mode stayed on with scanValue=30.
- Responsive checks for /settings mobile 390x844, tablet 768x1024, desktop 1440x900: overflowX=false.
- Production /pages/chat-cskh.html loaded module version chat-notice-20260601a; simulated Zalo customer message showed toast 'Zalo - Khach Test Zalo: ok test noi dung thong bao' (production UI uses the middle dot separator).

## Blockers
- None

## Resume Prompt
Continue "Chat/Zalo settings centralized and local AI safety lock" from this handoff. Re-read AGENTS.md, the relevant ShopHuyVan guards, and verify any drift-prone facts before editing or reporting pass.
