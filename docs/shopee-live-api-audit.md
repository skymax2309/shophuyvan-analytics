# Shopee Live API Audit

- Generated: 2026-05-15T07:19:10.241Z
- API base: https://huyvan-worker-api.nghiemchihuy.workers.dev
- Shop filter: not provided
- Live mutation mode: disabled
- Allowlist: not provided

> Dry-run checks never mutate Shopee. Live mutation must be implemented per object allowlist before use.

## Code Audit 2026-05-15

| Module | Shopee endpoint đọc | Shopee endpoint ghi | Trạng thái code | Điều kiện hiện thành công |
| --- | --- | --- | --- | --- |
| Discount | `/api/v2/discount/get_discount_list`, `/api/v2/discount/get_discount` | `add_discount`, `add_discount_item`, `update_discount`, `update_discount_item`, `delete_discount`, `delete_discount_item`, `end_discount` | Route `/api/discounts/shopee/action` trả kết quả thống nhất, che secret, giữ request_id/error_list và refetch detail sau mutation. | `verified=true` sau khi refetch đúng `discount_id`, đúng `item_id/model_id` và đúng giá hoặc trạng thái. |
| Voucher | `/api/v2/voucher/get_voucher_list`, `/api/v2/voucher/get_voucher` | `add_voucher`, `update_voucher`, `delete_voucher`, `end_voucher` | `/api/discounts/shopee/promotion-action` không báo thành công nếu Shopee từ chối hoặc refetch không xác nhận. | Refetch detail/list xác nhận object mất hoặc trạng thái đổi đúng. |
| Bundle Deal | `/api/v2/bundle_deal/get_bundle_deal_list`, `/api/v2/bundle_deal/get_bundle_deal`, `/api/v2/bundle_deal/get_bundle_deal_item` | `add/update/delete/end_bundle_deal`, `add/update/delete_bundle_deal_item` | Có guard chung, payload được preview trước và sau mutation refetch detail/list. | Refetch xác nhận tồn tại/mất/trạng thái đúng theo action. |
| Add-On Deal | `/api/v2/add_on_deal/get_add_on_deal_list`, `/api/v2/add_on_deal/get_add_on_deal`, main/sub item endpoints | `add/update/delete/end_add_on_deal`, main/sub item mutation endpoints | Có guard chung, không còn success dựa trên cache. | Refetch xác nhận đúng object/trạng thái. |
| Flash Sale | `/api/v2/shop_flash_sale/get_shop_flash_sale_list`, `/get_shop_flash_sale`, `/get_shop_flash_sale_items`, `/get_time_slot_id` | `create_shop_flash_sale`, `update_shop_flash_sale`, `delete_shop_flash_sale`, item mutation endpoints | Backend chặn create nếu thiếu `timeslot_id`; UI ghi rõ start/end chỉ để đối chiếu. | Refetch Flash Sale xác nhận object/trạng thái; create phải có `timeslot_id` thật từ Shopee. |
| ADS Manual Product Ads | `/api/v2/ads/get_product_level_campaign_setting_info` | `/api/v2/ads/edit_manual_product_ads` | Endpoint edit campaign sau POST bắt buộc refetch setting info và so status/budget/ROAS target. | `verified=true` khi campaign status/budget/ROAS target sau refetch khớp action. |
| TopPicks | `/api/v2/top_picks/get_top_picks_list` | `/api/v2/top_picks/add_top_picks`, `/update_top_picks`, `/delete_top_picks` | `/api/top-picks/shopee/action` có preview/confirm/refetch list verify. | Refetch `get_top_picks_list` xác nhận bộ TopPicks đổi/xóa đúng. |

## Live Test Status

- Chưa chạy mutation live nếu thiếu `SHOPEE_AUDIT_SHOP` và allowlist object an toàn.
- Không module nào được ghi là "đã kết nối Shopee thật" nếu chưa có live response + `request_id` + refetch verify.
- Để chạy live an toàn: đặt `SHOPEE_AUDIT_SHOP`, cung cấp `SHOPEE_LIVE_ALLOWLIST`, đặt `SHOPEE_LIVE_TEST=1`, rồi chạy `npm run shopee:test:live` trong `apps/worker-api`.

| Module | Endpoint | Action | HTTP | Status | Verified | Request ID | Message |
| --- | --- | --- | ---: | --- | --- | --- | --- |
| Discount | `/api/discounts/shopee/action` | `update_discount_item` |  | skipped | no |  | Set SHOPEE_AUDIT_SHOP to call the running API. |
| Voucher | `/api/discounts/shopee/promotion-action` | `delete` |  | skipped | no |  | Set SHOPEE_AUDIT_SHOP to call the running API. |
| Bundle | `/api/discounts/shopee/promotion-action` | `delete` |  | skipped | no |  | Set SHOPEE_AUDIT_SHOP to call the running API. |
| Add-On | `/api/discounts/shopee/promotion-action` | `delete` |  | skipped | no |  | Set SHOPEE_AUDIT_SHOP to call the running API. |
| Flash Sale | `/api/discounts/shopee/promotion-action` | `add` |  | skipped | no |  | Set SHOPEE_AUDIT_SHOP to call the running API. |
| ADS Manual Product Ads | `/api/ads/shopee/manual-product-ads/edit` | `pause` |  | skipped | no |  | Set SHOPEE_AUDIT_SHOP to call the running API. |
| TopPicks | `/api/top-picks/shopee/action` | `update` |  | skipped | no |  | Set SHOPEE_AUDIT_SHOP to call the running API. |

## Raw Results

```json
[
  {
    "module": "Discount",
    "endpoint": "/api/discounts/shopee/action",
    "body": {
      "action": "update_discount_item",
      "shop": "",
      "payload": {
        "discount_id": "DRY_RUN_REQUIRED",
        "item_list": []
      },
      "execute": false
    },
    "result": {
      "status": "skipped",
      "message": "Set SHOPEE_AUDIT_SHOP to call the running API."
    }
  },
  {
    "module": "Voucher",
    "endpoint": "/api/discounts/shopee/promotion-action",
    "body": {
      "module": "voucher",
      "action": "delete",
      "shop": "",
      "payload": {
        "voucher_id": "DRY_RUN_REQUIRED"
      },
      "execute": false
    },
    "result": {
      "status": "skipped",
      "message": "Set SHOPEE_AUDIT_SHOP to call the running API."
    }
  },
  {
    "module": "Bundle",
    "endpoint": "/api/discounts/shopee/promotion-action",
    "body": {
      "module": "bundle_deal",
      "action": "delete",
      "shop": "",
      "payload": {
        "bundle_deal_id": "DRY_RUN_REQUIRED"
      },
      "execute": false
    },
    "result": {
      "status": "skipped",
      "message": "Set SHOPEE_AUDIT_SHOP to call the running API."
    }
  },
  {
    "module": "Add-On",
    "endpoint": "/api/discounts/shopee/promotion-action",
    "body": {
      "module": "add_on_deal",
      "action": "delete",
      "shop": "",
      "payload": {
        "add_on_deal_id": "DRY_RUN_REQUIRED"
      },
      "execute": false
    },
    "result": {
      "status": "skipped",
      "message": "Set SHOPEE_AUDIT_SHOP to call the running API."
    }
  },
  {
    "module": "Flash Sale",
    "endpoint": "/api/discounts/shopee/promotion-action",
    "body": {
      "module": "shop_flash_sale",
      "action": "add",
      "shop": "",
      "payload": {
        "timeslot_id": "DRY_RUN_REQUIRED",
        "item_list": []
      },
      "execute": false
    },
    "result": {
      "status": "skipped",
      "message": "Set SHOPEE_AUDIT_SHOP to call the running API."
    }
  },
  {
    "module": "ADS Manual Product Ads",
    "endpoint": "/api/ads/shopee/manual-product-ads/edit",
    "body": {
      "shop": "",
      "campaign_id": "DRY_RUN_REQUIRED",
      "edit_action": "pause",
      "apply": false
    },
    "result": {
      "status": "skipped",
      "message": "Set SHOPEE_AUDIT_SHOP to call the running API."
    }
  },
  {
    "module": "TopPicks",
    "endpoint": "/api/top-picks/shopee/action",
    "body": {
      "action": "update",
      "shop": "",
      "payload": {
        "top_picks_id": "DRY_RUN_REQUIRED",
        "item_id_list": []
      },
      "execute": false
    },
    "result": {
      "status": "skipped",
      "message": "Set SHOPEE_AUDIT_SHOP to call the running API."
    }
  }
]
```
