# Chat AI Agent Phase 2

- Status: verified
- Updated: 2026-06-03T00:00:00+07:00
- Repo: E:\shophuyvan-analytics

## Summary
- Backend AI suggestion now reads `chat_ai_agent_config` structurally through `ai-agent-evidence-core.js`.
- Each AI draft stores and returns source/risk evidence in `suggestion.prompt_context`.
- Chat UI shows evidence before staff sends: enabled sources, matched order/product evidence, missing context, and handoff reason.
- Draft cleanup removes internal `Nguồn/Căn cứ/Rủi ro/Source/Evidence/Risk` lines from customer-facing text.
- Auto-send remains locked: production response verifies `policy_status=needs_review`, `agent_mode=suggest_only`, `auto_send=false`.

## Files
- apps/chat-worker-api/src/core/ai-agent-evidence-core.js
- apps/chat-worker-api/src/core/ai-policy-core.js
- apps/chat-worker-api/src/core/ai-settings-defaults.js
- apps/fe/js/dashboard/chat/render.js
- apps/fe/js/dashboard/chat/events.js
- apps/fe/pages/chat-cskh.html
- scripts/test-chat-ai-policy.mjs
- docs/chat-ai-agent-core-integration-plan.md
- docs/PROJECT-CURRENT-STATE.md

## Tests
- node --check for touched Chat Worker and Chat UI JS: pass
- node scripts/test-chat-ai-policy.mjs: pass
- node scripts/test-chat-ai-context.mjs: pass
- ECC before-edit and after-edit: pass

## Deploy
- Chat Worker `shophuyvan-chat-api`: version `4b08df34-187f-4690-8e5a-7250ac9ebcb7`, account `39cf0fe9b3eda88bda53e369770cabeb`.
- Static `shophuyvan-analytics`: version `fb62add1-fe62-42b6-9b2b-a7cfa4fe4929`, account `efe50fab1dd644088d681fb14a4838ae`.
- Worker chính `huyvan-worker-api`: not deployed.

## Verification
- Production `POST /api/chat/ai/suggest` returns `policy_status=needs_review`, `agent_mode=suggest_only`, `agent_handoff_required=true`, `agent_handoff_reason=Chưa khớp được đơn hàng với hội thoại`, `auto_send=false`, `provider=gemini`, `ai_status=active`.
- Production `pages/chat-cskh.html?v=chat-ai-evidence-20260603a` opened with Chrome profile `E:\codex-chrome-profiles\shophuyvan-test`; clicked `Gợi ý AI`; evidence block rendered; toast asks staff to read evidence before sending; `Gửi` was not clicked.
- Desktop/tablet/mobile viewport checks pass: evidence, composer, and send button visible; no horizontal overflow.

## Next Actions
- Phase 3: add approved-learning loop from staff-approved/sent replies, with private-data cleanup before saving reusable memory.
- Keep Zalo auto-send off until source evidence, countdown/cancel, send bridge, and audit log are implemented and verified in production.

## Resume Prompt
Continue "Chat AI Agent Phase 2" from this handoff. Re-read AGENTS.md, Chat/Core/UI guards, and `docs/PROJECT-CURRENT-STATE.md`; next step is Phase 3 approved-learning loop, not redoing settings or evidence.
