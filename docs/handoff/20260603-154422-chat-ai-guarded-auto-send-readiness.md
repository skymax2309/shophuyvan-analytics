# Chat AI guarded auto-send readiness deployed

- Status: done
- Updated: 2026-06-03T08:44:22.264Z
- Repo: E:\shophuyvan-analytics
- Source file: 20260603-154422-chat-ai-guarded-auto-send-readiness.md

## Summary
- Backend scheduled auto-send is blocked by default and requires explicit env + guarded settings.
- AI suggest now returns auto_send_readiness with visible countdown and cancel requirements.
- Chat composer includes guarded countdown shell, but production remains suggest_only so current AI drafts only.
- Deployed Chat Worker shophuyvan-chat-api version 681fc9c6-a396-4f7f-a427-1a690b353d72.
- Deployed static shophuyvan-analytics final version 708784cb-a7e7-481f-a133-5cf14a4ab1f2.

## Next Actions
- Keep Zalo/Facebook/marketplace AI in suggest_only unless guarded auto-send is explicitly enabled and verified per channel.
- If enabling auto-send later, verify countdown, cancel on edit/new customer message, bridge send result, and audit logs in production before allowing it.

## Files
- apps/chat-worker-api/src/core/ai-agent-evidence-core.js
- apps/chat-worker-api/src/core/ai-policy-core.js
- apps/chat-worker-api/src/core/sync-core.js
- apps/fe/js/dashboard/chat/auto-send.js
- apps/fe/js/dashboard/chat/events.js
- apps/fe/js/dashboard/chat/render.js
- apps/fe/js/dashboard/chat/state.js
- apps/fe/css/dashboard/chat.css
- apps/fe/pages/chat-cskh.html
- scripts/test-chat-ai-policy.mjs
- docs/PROJECT-CURRENT-STATE.md
- docs/chat-ai-agent-core-integration-plan.md

## Tests
- node --check changed Chat Worker core files: pass
- node --check changed Chat frontend files: pass
- node scripts/test-chat-ai-policy.mjs: pass
- npm run check in apps/chat-worker-api: pass
- node scripts/test-ui-design-system-guard.mjs for changed Chat UI files: pass
- ECC before-edit/after-edit hooks: pass

## Verification
- Production /api/chat/settings: ai_mode=suggest_only, allow_auto_send=false, agent mode suggest_only.
- Production /api/chat/ai/status: active with 2 Gemini keys.
- Production /api/chat/ai/suggest on real Lazada bridge conversation: auto_send=false, readiness eligible=false, visible countdown required; test suggestion rejected.
- Chrome CDP 127.0.0.1:9333 production /pages/chat-cskh?v=chat-auto-send-20260603a&verify=708784cb: clicked Goi y AI, draft/evidence appeared, shop message count unchanged, countdown false, sending false, no Failed to fetch.
- Responsive production readback: desktop 1366x900, tablet 820x1180, mobile 390x844 all overflowX=false, controls visible, no console warnings/errors.

## Blockers
- None for this phase. Auto-send remains intentionally locked by settings/env until a separate guarded channel verification is requested.

## Resume Prompt
Continue "Chat AI guarded auto-send readiness deployed" from this handoff. Re-read AGENTS.md, the relevant ShopHuyVan guards, and verify any drift-prone facts before editing or reporting pass.
