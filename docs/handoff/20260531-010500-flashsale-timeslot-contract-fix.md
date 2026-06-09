# Flash Sale timeslot + flash_sale_id contract fix (production API verified)

- Status: needs_ui_verification
- Updated: 2026-05-31T01:05:00+07:00
- Repo: E:\shophuyvan-analytics

## Summary
- Fixed backend route `apps/worker-api/src/routes/discounts/flash-deal-endpoints.js` for:
  - `timeslot_id` to `flash_sale_id` resolve before item read/update/delete.
  - admin guard on `POST /api/discounts/flash-deal/items/add`.
  - empty payload guard (`empty_item_payload`) before Shopee mutation.
  - auto default `start_time/end_time` on `/api/discounts/flash-deal/timeslots`.
- Deployed Worker latest version: `e10ec7c9-1b21-4f04-8510-7473f1ec5af4`.

## Production checks done
- `GET /api/discounts/flash-deal/timeslots?shop=chihuy1984`
  - before: `400 shop_flash_sale_param_error`
  - after: `200` with `timeslots[]`.
- `GET /api/discounts/flash-deal/items?shop=chihuy1984&timeslot_id=<slot>`
  - returns `missing_flash_sale_id` when slot has no flash sale yet (expected with new contract).
- `POST /api/discounts/flash-auto/run` without auth returns `403 admin_required` (guard OK).

## Endpoint status
- Shopee Flash Sale family (`shop_flash_sale/*`): available and in use.
- Lazada Flash Sale create/list/add/update/delete item: endpoint_not_available in public docs.

## Remaining
- UI production verification desktop/tablet/mobile for run-now is pending due missing Playwright Chrome Extension in current environment.
- Need manual browser verification with profile `E:\codex-chrome-profiles\shophuyvan-test`.
