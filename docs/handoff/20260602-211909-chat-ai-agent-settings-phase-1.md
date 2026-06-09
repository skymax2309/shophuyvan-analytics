# Chat AI Agent Settings Phase 1

- Status: in_progress
- Updated: 2026-06-02T14:19:09.791Z
- Repo: E:\shophuyvan-analytics
- Source file: 20260602-211909-chat-ai-agent-settings-phase-1.md

## Summary
- Added Settings UI for AI CSKH training: role, allowed data sources, confidence gate, handoff rule, evidence requirement, future cancel countdown.
- Stored new configuration through Chat settings as chat_ai_agent_config and kept Zalo configuration as zalo_reply_config.
- Merged managed AI CSKH and Zalo training sections into ai_learning_notes so current AI suggestions can use the rules before backend structured-agent work.
- Split AI/Zalo settings logic into apps/fe/js/dashboard/chat-settings-agent.js; chat-settings.js is now below 30KB.
- Zalo helper mirroring still forces autoWelcomeOnNewFriend=false and autoGreetOnFirstInbound=false; Zalo auto-send remains locked.

## Next Actions
- Open /settings and save Hu?n luy?n AI CSKH, then read back chat_ai_agent_config from /api/chat/settings.
- Run UI design guard and browser verification on desktop, tablet, and mobile viewports.
- Deploy FE static only after local/browser verification passes.
- Next phase: update AI suggestion backend to read chat_ai_agent_config structurally and return evidence/risk before staff sends.

## Files
- apps/fe/settings.html
- apps/fe/js/dashboard/chat-settings.js
- apps/fe/js/dashboard/chat-settings-agent.js
- apps/fe/css/dashboard/chat-settings.css
- docs/chat-ai-agent-core-integration-plan.md
- docs/PROJECT-CURRENT-STATE.md

## Tests
- node --check apps/fe/js/dashboard/chat-settings.js: pass
- node --check apps/fe/js/dashboard/chat-settings-agent.js: pass
- node scripts/test-chat-ai-policy.mjs: pass
- node scripts/test-chat-ai-context.mjs: pass

## Verification
- Not deployed yet in this handoff.
- Production/browser settings save-readback still pending.

## Blockers
- No blocker yet.

## Resume Prompt
Continue "Chat AI Agent Settings Phase 1" from this handoff. Re-read AGENTS.md, the relevant ShopHuyVan guards, and verify any drift-prone facts before editing or reporting pass.
