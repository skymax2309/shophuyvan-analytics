# Settings Zalo AI reply configuration and training

- Status: done
- Updated: 2026-06-01T06:18:35.886Z
- Repo: E:\shophuyvan-analytics
- Source file: 20260601-131835-zalo-ai-settings-training.md

## Summary
- Added a real Zalo auto-reply configuration panel at the top of /settings tab Kenh chat.
- Saved reply style, welcome template, first-inbound template, training notes, and future auto-send delay into Chat settings as zalo_reply_config.
- Merged the Zalo training section into ai_learning_notes so the current AI context can read it.
- Mirrored safe greeting templates to the local Zalo helper while keeping welcome/first-inbound auto rules off.
- Renamed technical labels in this panel to operator-facing Vietnamese labels.

## Next Actions
- Only enable Zalo AI auto-send later after adding reviewed rules, visible countdown, cancel action, and live conversation tests.
- If Zalo replies are still irrelevant, inspect AI prompt composition and ensure zalo_reply_config is included in the actual suggestion path.
- Clean up old local Zalo KB/routes only after confirming no production caller still depends on them.

## Files
- apps/fe/settings.html
- apps/fe/js/dashboard/chat-settings.js
- apps/fe/css/dashboard/chat-settings.css
- docs/PROJECT-CURRENT-STATE.md

## Tests
- node --check apps/fe/js/dashboard/chat-settings.js: pass
- node scripts/test-ui-design-system-guard.mjs: pass
- Scoped mojibake scan for settings/chat-settings files: pass
- ECC hook before-edit: pass
- ECC hook after-edit: pass

## Verification
- Deployed static shophuyvan-analytics version 8593b41f-a008-4950-9bd1-460a9522c742.
- Production /settings tab Kenh chat loaded script/css cache-bust zalo-ai-training-20260601e.
- Clicked Save Zalo AI config on production; toast confirmed saved and safe auto-send lock.
- Chat Worker readback shows Vietnamese zalo_reply_config and ai_learning_notes marker Zalo - cach tra loi rieng.
- Zalo local readback shows autoSendEnabled=false, localAiReplyEnabled=false, auto rules false, both accounts connected and AI off.
- Production desktop 1366x900, tablet 820x1180, mobile 390x844: overflowX=false and first card is Tu tra loi Zalo.

## Blockers
- None

## Resume Prompt
Continue "Settings Zalo AI reply configuration and training" from this handoff. Re-read AGENTS.md, the relevant ShopHuyVan guards, and verify any drift-prone facts before editing or reporting pass.
