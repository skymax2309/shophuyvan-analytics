---
name: shophuyvan-progress-handoff
description: Luu va doc lai tien trinh dang do cua ShopHuyVan giua cac khung chat Codex. Use when the user asks to save unfinished work, continue a previous issue in a new chat, recover context after compaction, record blockers, or create a handoff for UI/Core/Chat/Automation/Deploy tasks that are not fully done.
---

# ShopHuyVan Progress Handoff

Use this skill to make unfinished work recoverable in a new Codex chat.

## Storage

- Canonical current handoff: `docs/handoff/LATEST.md`.
- Historical records: `docs/handoff/YYYY-MM-DD-HHmmss-slug.md`.
- Use the helper script: `skills/shophuyvan-progress-handoff/scripts/progress-handoff.mjs`.
- Do not store secrets, tokens, cookies, API keys, raw local config, or customer private data.

## When Starting A New Or Continued Task

1. Read `docs/handoff/LATEST.md` if it exists.
2. Check whether the handoff matches the user's current request.
3. Continue only from verified facts. If a fact is drift-prone, re-check it in the repo or production before relying on it.
4. Keep the normal ShopHuyVan routing guards active. This skill does not replace AGENTS.md, Core guards, UI guards, hooks, deploy checks, or production verification.

## When Pausing Or Switching Chats

Create a handoff before final response if the work is not fully complete, blocked, waiting for login, waiting for deploy, waiting for production verification, or intentionally paused.

Required fields:

- `title`: short task name.
- `status`: one of `in_progress`, `blocked`, `needs_verification`, `done`.
- `summary`: what was actually done.
- `next`: concrete next actions.
- `files`: files changed or important files to inspect next.
- `tests`: commands already run and result.
- `verification`: production/browser checks already done or still missing.
- `blockers`: user action, permission, login, port, data, endpoint, or deploy blockers.

## Script Usage

Write or update the latest handoff:

```powershell
@'
{
  "title": "Promotions UI/UX redesign",
  "status": "in_progress",
  "summary": [
    "Read UI guards and inspected promotions page files.",
    "before-edit hook passed."
  ],
  "next": [
    "Inspect production page in Chrome desktop/tablet/mobile.",
    "Redesign tab order and primary actions.",
    "Run hooks, deploy static, verify production."
  ],
  "files": [
    "apps/fe/pages/promotions.html",
    "apps/fe/css/dashboard/promotions-page.css"
  ],
  "tests": [
    "Hook before-edit: pass"
  ],
  "verification": [
    "Production UI verification not done yet"
  ],
  "blockers": []
}
'@ | node skills/shophuyvan-progress-handoff/scripts/progress-handoff.mjs write --slug promotions-ui-ux
```

Read the latest handoff:

```powershell
node skills/shophuyvan-progress-handoff/scripts/progress-handoff.mjs latest
```

List recent handoffs:

```powershell
node skills/shophuyvan-progress-handoff/scripts/progress-handoff.mjs list
```

## Output Rule

When using a handoff to resume work, state which handoff file was used and which facts were re-verified. Do not claim the old task is done unless the current turn verifies the required completion conditions.
