---
name: shophuyvan-ui-ux-master-skill
description: Enforce ShopHuyVan operator-first UX/UI standards for every user-facing screen in E:\shophuyvan-analytics, especially OMS, ADS, Khuyến mãi sàn, Product Master, Finance, Chat/CSKH, scanner, settings, mobile-first responsive work, Vietnamese UI copy, design tokens, and production browser verification.
---

# ShopHuyVan UI/UX Master Skill

## Required Reads

Before changing any ShopHuyVan UI, read:

- `AGENTS.md`
- `shophuyvan-ui-design-system-guard`
- `shophuyvan-ui-end-user-guard`
- `docs/ui-design-system.md`
- `docs/ui-production-checklist.md`
- `docs/shophuyvan-ui-master-prompt .md`
- `apps/fe/css/theme/shophuyvan-design-tokens.css`
- `scripts/test-ui-design-system-guard.mjs`

If the UI renders OMS/Core data, also read the matching Core guard. UI must render Core/read-model fields only and must not calculate business status, eligibility, finance, tracking, label, ADS, or promotion rules.

## Operator-First Rule

Design for the person operating the shop, not for debugging. The first screen must show the current problem, the important number/status, and the next safe action. Do not show technical implementation details on the main UI.

Forbidden user-facing text includes: `payload`, `endpoint`, `route`, `request_id`, `cache`, `guard`, `read-model`, `Core`, `raw response`, `JSON`, table names, raw tokens, long stack traces, and debug panels. If a blocker is technical, translate it into a short Vietnamese business label such as `Thiếu quyền API`, `Sàn chưa xác nhận`, `Chỉ xem dữ liệu`, or `Cần đồng bộ lại`.

## Anti-patterns Hay Tái Hiện

Những lỗi dưới đây đã xảy ra trong production; không được lặp lại:

- **`[object Object]` hoặc `undefined` render ra UI**: dữ liệu từ sàn chưa parse đúng hoặc
  không qua `esc()`. Phải handle null/undefined và dùng fallback label nghiệp vụ trước khi render.
- **Mojibake trên UI**: dữ liệu UTF-8 bị decode sai. Sau khi sửa text tiếng Việt phải chạy
  `rg "Ã|áº|Ä"` và dùng `repairMojibake()` ở tầng render nếu dữ liệu cũ trong DB bị lỗi.
- **Badge màu đặc**: `background: #22c55e` thay vì `rgba(34, 197, 94, 0.15)`. Mọi badge phải
  dùng nền opacity 15%, không màu solid.
- **Nút không disable sau click**: API bị gọi nhiều lần do spam click. Disable ngay sau click
  đầu tiên, đổi text thành "Đang xử lý...", chỉ mở lại khi API trả về.
- **Màn hình trắng khi load**: không skeleton, không empty state. Phải có skeleton đúng số hàng
  hoặc empty state với text context cụ thể bằng tiếng Việt.
- **Class CSS không có prefix**: `.card`, `.table`, `.badge` không prefix bị override bởi page
  khác. Mọi class phải có prefix theo page/module: `.ads-card`, `.oms-badge`, `.finance-table`.
- **No-API shop hiện trạng thái API**: TikTok hoặc Shopee no-API hiện label "Đang đồng bộ API"
  → vi phạm Marketplace/API UI Rules. Phân biệt rõ nguồn dữ liệu.
- **`0` hiện thành `--` hoặc ô trống**: `0` là dữ liệu thật. Chỉ `null` mới được render thành
  `--` hoặc `Chưa có dữ liệu`.
- **Layout plan bị bỏ qua với lý do "task nhỏ"**: mọi thay đổi UI dù nhỏ đều cần layout plan
  tối thiểu 2 dòng trong work log trước khi edit file.
- **Báo pass từ code review hoặc build**: không mở Chrome production thật →
  không được báo pass. Phải có production browser verification.
  
## Vietnamese Copy

All visible UI copy must be Vietnamese with full diacritics. Keep labels short and operational. Avoid long help blocks on the main screen. Use clear action labels such as `Làm mới`, `Đồng bộ dữ liệu`, `Kiểm tra tem`, `Theo dõi`, `Xác nhận áp dụng`, and `Mở chi tiết`.

Code comments added in ShopHuyVan UI files should be Vietnamese with full diacritics when a comment is genuinely needed.

## Layout Contract

Every page should follow this order unless the existing page has a stronger established pattern:

1. Header: page title, one-line status/context, primary action, last updated time when useful.
2. Filter bar: only essential filters visible; advanced filters grouped.
3. Summary: 4-6 compact cards max, each with one main value, one label, one short supporting line.
4. Main work area: table on desktop or card/list on mobile, with clear row actions.
5. Detail drawer/modal: deeper evidence, before/after, warnings, and secondary actions.
6. Loading/empty/error/success states: short Vietnamese message plus a useful action.

Do not nest cards inside cards. Do not use fixed-width layouts for dynamic data. Do not use floating decorative sections, oversized marketing heroes, or explanatory blocks where an operator needs a tool.

## Design Tokens

Use the shared dark design system and tokens from `apps/fe/css/theme/shophuyvan-design-tokens.css`. Do not introduce a one-off color system for a page.

- Background: dark blue/black, never pure white cards inside the admin shell.
- Card/panel border: thin and low contrast.
- Text: high contrast for primary values; muted but readable for secondary text.
- Status colors: semantic success/warning/danger/info only.
- Radius: 12-16px for panels, 6-8px for compact controls.
- Spacing: mobile 12px page padding, tablet 16px, desktop 24px; use 12-16px gaps for dense work surfaces.
- Numeric columns: right-aligned with tabular numbers.
- Soft badge: text color + background opacity 15% — không dùng màu solid cho badge trạng thái.
- Hover hàng bảng: `background: rgba(255,255,255,0.02)`, `transition: background 150ms ease`.
- Skeleton: gradient shimmer `#0a192b → #112240 → #0a192b`, `animation: shimmer 1.5s infinite`.
- Z-index layers cố định: sticky header `10`, dropdown/tooltip `100`, sidebar `200`,
  drawer `300`, modal backdrop `400`, modal content `500`, toast `999`.
  Không dùng `z-index: 9999` hoặc số tùy tiện.

## Responsive Acceptance

Mobile first is mandatory. Verify all changed UI at:

- Mobile: `390x844`
- Tablet: `820x1180`
- Desktop: `1366x900`

Pass only when there is no horizontal page overflow, no clipped text, no overlapping labels/icons/buttons, controls are tappable, drawers/modals remain usable, and table-heavy views become mobile card/list views or have a clear bounded scroll.

## Marketplace/API UI Rules

Shop API and no-API flows must be visually distinct:

- Shopee API shops: `chihuy1984`, `chihuy2309`, `phambich2312`.
- Lazada API shop: `kinhdoanhonlinegiasoc@gmail.com`.
- Shopee no-API and TikTok local/browser fallback must not be labeled as API sync.

When data is missing for an API shop, the UI should show the business blocker from Core/read-model (`Thiếu quyền API`, `Đang chờ sàn`, `Chưa có dữ liệu vận chuyển`) instead of inventing a fallback status. `0` is real observed data; `null` is missing and must remain distinguishable.

## Before Editing UI

Write a short layout plan in the work log before file edits:

- User goal of this screen.
- First information the operator must see.
- Header/filter/summary/main/detail/empty-error shape.
- Core/read-model fields the UI will render.
- Breakpoints that must be checked.

## Verification

Run the checks that match the changed surface:

- `node scripts/test-ui-design-system-guard.mjs`
- Syntax checks for changed JS.
- `rg "Ã|áº|Ä" --type md --type js --type html --type py` after editing Vietnamese text.
- Production browser verification with `E:\codex-chrome-profiles\shophuyvan-test` for desktop/tablet/mobile.

Do not report UI done from code review, build, or local-only checks. For a reported production bug, open the real screen, perform the exact changed flow, and confirm the issue is gone.
Không được báo pass khi:
- Còn `[object Object]`, `undefined`, từ kỹ thuật thô nào trên UI production.
- Còn mojibake trên bất kỳ text tiếng Việt nào.
- Chưa mở Chrome profile `E:\codex-chrome-profiles\shophuyvan-test` và kiểm production thật.
- Job/action chỉ ở trạng thái `queued` hoặc `running`, chưa có kết quả cuối.

### Toast Sau Action Ghi Dữ Liệu

Mọi action ghi dữ liệu (Lưu, Áp dụng, Đồng bộ, Gửi tin) phải hiện toast kết quả:
- Thành công: icon ✓ + text nghiệp vụ ngắn, ví dụ `"Đã lưu cài đặt ADS"`, auto-dismiss `3000ms`.
- Thất bại: icon ✗ + text lỗi nghiệp vụ, không phải HTTP status code thô.
- Toast góc dưới phải, `z-index: 999`, không che bảng dữ liệu chính.
- Không dùng `alert()` hoặc `confirm()` native của browser.

## Final Report Checklist

Report:

- UI skill and guard files read.
- Layout plan used.
- Core/read-model fields rendered and confirmation that UI did not add business logic.
- Design token/test results.
- Production desktop/tablet/mobile result.
- Any endpoint, permission, or source blocker that remains.
