# Chat AI Agent CSKH - Integration Plan

Date: 2026-06-02

## Goal

Build a ShopHuyVan customer-support AI agent that can draft useful replies for marketplace chat, Zalo, and Facebook without mixing conversations, inventing product/order facts, or sending unsafe replies automatically.

The first production rule remains: AI drafts first, staff sends. Zalo auto-send stays locked until review, cancel countdown, source evidence, and approved knowledge gates are verified.

## Reference Repos Reviewed

These repositories are references only. Do not copy their stack directly into production.

| Repo | Useful Pattern | Fit |
|---|---|---|
| `tgoai/tgo` | Agent workflow and tool orchestration ideas | Good reference for multi-step agent routing |
| `haoyiyin/basjoo` | Customer-support memory and helpdesk patterns | Useful for support-agent UX and knowledge handling |
| `huabeitech/agent-desk` | Operator desk + agent handoff concept | Useful for human review and escalation |
| `Bytedesk` ecosystem | Full customer-service platform shape | Reference only; too heavy to import directly |
| Zalo community scripts | Browser/local automation examples | Not production-safe as the core AI layer |

## ShopHuyVan Target Architecture

```
Chat/Zalo/Facebook conversation
-> Chat settings and approved knowledge
-> Product/order/policy data already verified by the system
-> AI draft with source/risk evidence
-> Staff review/send
-> Approved reply can be saved back to AI memory
```

## Phase 1 - Settings And Training Contract

Implemented in `/settings`:

- Central `chat_ai_agent_config` stored through `/api/chat/settings`.
- Zalo reply config still stored as `zalo_reply_config`.
- AI learning notes are rebuilt with two managed sections:
  - `AI CSKH - luật vận hành`
  - `Zalo - cách trả lời riêng`
- Raw conversation learning is disabled. AI only learns from manual notes and approved replies.
- Zalo local helper mirror keeps `autoWelcomeOnNewFriend=false` and `autoGreetOnFirstInbound=false`.

## Phase 2 - Suggestion Evidence

Implemented on 2026-06-03:

- AI suggestion route reads `chat_ai_agent_config` as structured settings, not only through `ai_learning_notes`.
- Each saved draft includes `prompt_context` evidence:
  - enabled source labels
  - evidence lines for order/product/policy/approved replies/Zalo notes
  - missing context
  - risk labels and handoff reason
  - whether staff review is required
- Chat composer shows the evidence block before the send button.
- AI draft text is cleaned so internal source/risk lines are not inserted into the customer reply.
- Auto-send stays off unless a later phase verifies source evidence, countdown/cancel, send bridge, and audit logs.

## Phase 3 - Approved Learning Loop

Implemented on 2026-06-03:

- Staff-approved learning now writes through Chat Worker `ai_knowledge_base`, with `status`, `intent`, `source_tags`, source message metadata, dedupe key, and sanitization metadata.
- Settings page `/settings` has a central `Bộ nhớ trả lời` manager for add, edit, disable, enable, delete, search, status filter, and recent learning audit.
- Chat UI only learns from a staff reply after the message is actually sent successfully. The old "learn before send" path is blocked.
- Approved learning requires a source customer message and a sent shop message before saving reusable memory.
- Phone, email, links, order/tracking-like codes, address fragments, and known private values are redacted before a reply can become reusable AI memory.
- Every create, edit, disable, enable, delete, approved-save, and dedupe event writes `ai_learning_audit_logs`.
- Zalo auto-send remains locked; this phase improves the memory gate, not automatic sending.

## Phase 4 - Guarded Auto-Send Readiness

Status on 2026-06-03:

- Production settings are locked back to `ai_mode=suggest_only`, `allow_auto_send=false`, `chat_ai_agent_config.mode=suggest_only`, and `zalo_reply_config.mode=suggest_only`.
- Gemini key health is active after `/api/chat/ai/test`; status card must reload after test.
- Backend guard is deployed on Chat Worker `shophuyvan-chat-api` version `f6a05400-969d-4048-aeb0-2b776a2650c9` using Cloudflare account `zacha030596@gmail.com` / `39cf0fe9b3eda88bda53e369770cabeb`.
- Production readback after deploy: `/api/chat/settings` stays `allow_auto_send=false`, `/api/chat/ai/suggest` stays `policy_status=needs_review` and `auto_send=false`, and `/settings?v=chat-ai-backend-f6a05400` shows AI active with saved `2/5` Gemini keys.
- Guarded readiness is deployed on Chat Worker version `681fc9c6-a396-4f7f-a427-1a690b353d72`: AI suggestions now include `auto_send_readiness` with suggestion id, delay seconds, visible countdown requirement, and cancel-on-customer-message requirement.
- Backend scheduled auto-send is blocked by default. It only runs if production explicitly sets `CHAT_AI_BACKEND_AUTO_SEND` or `CHAT_AI_BACKEND_AUTO_REPLY` and settings are `allow_auto_send=true` + `chat_ai_agent_config.mode=auto_send_guarded`.
- Chat UI version `chat-auto-send-20260603a` includes a visible countdown/cancel shell, cancels on operator edit, conversation switch, or new customer message, and uses the existing send path only after countdown completes.
- Production browser verification on `/pages/chat-cskh?v=chat-auto-send-20260603a&verify=708784cb`: clicking `Gợi ý AI` produced a draft and evidence in the composer, did not add a shop message, did not show countdown in `suggest_only`, and had no console warnings/errors or responsive overflow on desktop/tablet/mobile.

Only consider auto-send when all are true:

- The channel has a real send bridge.
- The draft has high confidence and source evidence.
- No complaint, refund, warranty, price dispute, address, phone, or sensitive data risk.
- A visible countdown and cancel action were tested in production.
- Audit log records draft, evidence, countdown, and send result.

Until this phase is verified, Zalo remains staff-send or staff-approved only.
