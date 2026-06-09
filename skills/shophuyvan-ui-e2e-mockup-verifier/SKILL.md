---
name: shophuyvan-ui-e2e-mockup-verifier
description: >
  Use when ShopHuyVan Promotions UI changes need end-to-end mockup parity verification
  through an existing Chrome session (CDP localhost:9333), including desktop/tablet/mobile
  screenshots and selector checks for overview plus Flash Auto sections.
---

# ShopHuyVan UI E2E Mockup Verifier

## Purpose
- Verify Promotions UI parity end-to-end from a real Chrome profile via CDP.
- Capture evidence screenshots for desktop/tablet/mobile.
- Validate key overview and Flash Auto UI blocks using selector probes.
- Persist machine-readable verification output for handoff and audit.

## When to use
- After UI edits on Promotions and Flash Auto flows.
- Before declaring responsive parity pass.
- When you need production-like evidence tied to Chrome profile state.

## Inputs
- Chrome must expose CDP at `http://127.0.0.1:9333`.
- Promotions URL should be provided explicitly with `--url`.

## Command
```powershell
node skills/shophuyvan-ui-e2e-mockup-verifier/scripts/verify-promotions-mockup-cdp.mjs --url "https://<target-host>/pages/promotions.html"
```

## Output artifacts
- Folder: `E:\shophuyvan-runtime\verification\promotions-mockup`
- PNG screenshots: one per viewport (`desktop`, `tablet`, `mobile`)
- JSON summary:
  - Timestamped file: `promotions-mockup-summary-<stamp>.json`
  - Latest pointer: `promotions-mockup-summary-latest.json`

## Pass criteria
- Overview selectors matched.
- Flash Auto selectors matched after attempting to activate the Flash Auto tab/section.
- Screenshots captured successfully for all three viewports.

## Notes
- If selectors fail, update selector candidates in the script to reflect current DOM.
- Keep this skill scoped to UI parity verification; do not mix deploy logic in this skill.
