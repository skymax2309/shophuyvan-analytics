# Chat Social Transport Audit - 2026-06-09

## Scope

- Chatwoot Facebook channel docs: https://developers.chatwoot.com/self-hosted/configuration/features/integrations/facebook-channel-setup/
- Chatwoot GitHub: https://github.com/chatwoot/chatwoot
- zca-bridge GitHub: https://github.com/diendh/zca-bridge
- zca-js GitHub: https://github.com/RFS-ADRENO/zca-js
- Local audited clone: `E:\shophuyvan-runtime\security-audit\zca-bridge-20260609-6209049`
- Audited zca-bridge commit: `6209049fff18273749ed73e2d1d4645bde516dab`

## Decision

Use Chatwoot as a reference, not as ShopHuyVan's operator UI or source of truth.

ShopHuyVan Chat Core remains the only conversation/message store:

`Facebook/Zalo transport -> shophuyvan-chat-api -> chat_conversations/chat_messages -> existing Chat UI`

Do not deploy a second Chatwoot UI/database for production CSKH unless the user explicitly accepts a separate helpdesk stack and data-ownership change.

## Facebook

Recommended path: official Meta Messenger API directly in `shophuyvan-chat-api`.

Implemented first pass:

- `apps/chat-worker-api/src/adapters/facebook.js`
- `apps/chat-worker-api/src/routes/webhook-ingest.js`
- `apps/chat-worker-api/src/core/capability-core.js`
- `scripts/test-chat-facebook-adapter.mjs`

Required Cloudflare secrets before real production use:

- `FACEBOOK_VERIFY_TOKEN`
- `FACEBOOK_APP_SECRET`
- `FACEBOOK_PAGE_ACCESS_TOKEN` or `FACEBOOK_PAGE_TOKENS_JSON`

Meta setup notes:

- Webhook callback: `/api/chat/webhook/facebook`
- GET verification uses `hub.verify_token`.
- POST event verification uses `X-Hub-Signature-256` with app secret.
- Subscribe Page to `messages` and related fields after Meta app permission approval.

## zca-bridge

Audit result: do not integrate wholesale.

Reasons:

- It is designed as `Zalo -> zca-bridge Postgres -> Chatwoot -> Chatwoot DB/UI`.
- That creates a second chat source, against ShopHuyVan Core-first rules.
- It is very new: created 2026-06-04, audited on 2026-06-09.
- It has open owner-created production/security issues:
  - https://github.com/diendh/zca-bridge/issues/1
  - https://github.com/diendh/zca-bridge/issues/2
  - https://github.com/diendh/zca-bridge/issues/3
  - https://github.com/diendh/zca-bridge/issues/4
  - https://github.com/diendh/zca-bridge/issues/5

Useful ideas to borrow:

- Durable outbound queue.
- Dead-letter/retry model.
- OA webhook signature verifier.
- Per-account reconnect/backoff for personal Zalo.
- Media token and archive pattern, but with finite TTL.

Security findings:

- No known malware found by Microsoft Defender scan on the cloned source.
- `npm audit` returned 0 known vulnerabilities for current lockfile.
- Source scan found no `.exe`, `.dll`, `.bat`, `.cmd`, `.ps1`, `.vbs`, `.node`, or `.wasm` files.
- `docker-compose.full.yml` uses `ghcr.io/diendh/zca-bridge:latest`; do not use mutable `latest`.
- Admin cookie is not Secure by default in source.
- Admin setup/login lacks CSRF and rate-limit hardening.
- Chatwoot webhook secret is path-based; prefer HMAC when adapting.
- Default media token TTL is indefinite; ShopHuyVan should set a finite TTL.

## zca-js

`zca-js` can remove Chrome automation for Zalo personal, but it is not official Zalo API.

Risk:

- Account/session risk: personal accounts may be restricted or banned.
- Stability risk: open issues report duplicate listener messages and WebSocket close code `1006`.
- Data risk: exact duplicate/order bugs can reappear unless Chat Core keeps semantic dedupe.

Relevant open issues:

- https://github.com/RFS-ADRENO/zca-js/issues/348
- https://github.com/RFS-ADRENO/zca-js/issues/347
- https://github.com/RFS-ADRENO/zca-js/issues/333
- https://github.com/RFS-ADRENO/zca-js/issues/351
- https://github.com/RFS-ADRENO/zca-js/issues/215

Recommended next step:

- Build a separate `zalo-zca-sidecar` pilot for one secondary account.
- Keep current browser-helper as rollback.
- Push inbound/outbound only through `/api/chat/browser-helper/push` or a new signed sidecar route.
- Add semantic dedupe in Chat Core before allowing production auto-send.
- Keep AI auto-send off until a real readback loop proves no duplicate, no wrong thread, and no lost session.
