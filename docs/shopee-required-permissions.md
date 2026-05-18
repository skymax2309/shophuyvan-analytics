# Shopee required permissions

Cập nhật: 2026-05-15. Tài liệu đối chiếu từ reference Shopee Open Platform trong skill `shopee-open-platform-docs` và code diagnostics hiện tại. Kết quả live cuối cùng phải dựa trên `POST /api/admin/shopee/diagnostics` và Shopee Console > API Access Log.

## Cấu hình app bắt buộc

| Nhóm | Client dùng trong code | Env | Dùng cho | Không dùng cho |
| --- | --- | --- | --- | --- |
| Shopee Ads API | `ads_client` | `SHOPEE_ADS_PARTNER_ID`, `SHOPEE_ADS_PARTNER_KEY`, `SHOPEE_ADS_SHOP_ID`, `SHOPEE_ADS_ACCESS_TOKEN`, `SHOPEE_ADS_REFRESH_TOKEN`, `SHOPEE_ADS_API_BASE_URL`, `SHOPEE_ADS_REDIRECT_URL` | Campaign, keyword, budget, clicks, impressions, CPC, Ads reporting, recommended item nếu endpoint Ads cho phép | Discount, Voucher, Bundle Deal, Add-On Deal, Shop Flash Sale, product price/stock |
| Shopee Marketplace/Seller/Marketing API | `marketplace_client` | `SHOPEE_MARKETPLACE_PARTNER_ID`, `SHOPEE_MARKETPLACE_PARTNER_KEY`, `SHOPEE_MARKETPLACE_SHOP_ID`, `SHOPEE_MARKETPLACE_ACCESS_TOKEN`, `SHOPEE_MARKETPLACE_REFRESH_TOKEN`, `SHOPEE_MARKETPLACE_API_BASE_URL`, `SHOPEE_MARKETPLACE_REDIRECT_URL` | Item/model/variation, stock/price nếu có quyền, Discount, Voucher, Bundle Deal, Add-On Deal, Shop Flash Sale | Ads campaign/keyword/budget nếu app không có Ads scope |
| Live write guard | Cả hai client | `SHOPEE_LIVE_WRITE_ENABLED=false`, `SHOPEE_ENV=live` | Chặn mọi lệnh ghi thật khi chưa xác nhận | Không chặn endpoint đọc |

## Product / Item / Model

| Nghiệp vụ | Endpoint | Quyền/app cần | Client |
| --- | --- | --- | --- |
| Đọc thông tin shop | `/api/v2/shop/get_shop_info` | App đã authorize shop | `marketplace_client` |
| Đọc item | `/api/v2/product/get_item_list` | Product/ERP/Seller/Marketing app tùy scope được cấp | `marketplace_client` |
| Đọc model/variation | `/api/v2/product/get_model_list` | Product/ERP/Seller/Marketing app tùy scope được cấp | `marketplace_client` |
| Đọc/cập nhật stock/price | Endpoint product/stock/price tương ứng trong Open Platform | Cần app Marketplace/Seller/Product có quyền write; chưa dùng Ads Service | `marketplace_client` |

Điều kiện vận hành: nếu thiếu `item_id`, `model_id` hoặc `variation/model` thì không gửi Discount/Bundle/Add-On/Flash payload. UI phải có bước kéo model từ Shopee trước.

## Discount

| Nghiệp vụ | Endpoint | Quyền/app cần | Client |
| --- | --- | --- | --- |
| Đọc danh sách | `/api/v2/discount/get_discount_list` | ERP, Seller In House, Marketing, Customized APP, Swam ERP theo reference | `marketplace_client` |
| Đọc chi tiết | `/api/v2/discount/get_discount` | ERP, Seller In House, Order Management, Accounting and Finance, Marketing, Customized APP, Swam ERP theo reference | `marketplace_client` |
| Tạo discount | `/api/v2/discount/add_discount` | ERP, Seller In House, Marketing, Swam ERP | `marketplace_client` |
| Update discount | `/api/v2/discount/update_discount` | ERP, Seller In House, Marketing, Swam ERP | `marketplace_client` |
| Thêm/update/xóa item | `/api/v2/discount/add_discount_item`, `/api/v2/discount/update_discount_item`, `/api/v2/discount/delete_discount_item` | ERP, Seller In House, Marketing, Swam ERP | `marketplace_client` |
| End/delete | `/api/v2/discount/end_discount`, `/api/v2/discount/delete_discount` | ERP, Seller In House, Marketing, Swam ERP | `marketplace_client` |

Trạng thái code: Shopee Discount là module duy nhất đang có đường execute queue thật, nhưng vẫn bị chặn khi `SHOPEE_LIVE_WRITE_ENABLED=false` và chỉ pass khi refetch verify `verified=true`.

## Voucher

| Nghiệp vụ | Endpoint | Quyền/app cần | Client |
| --- | --- | --- | --- |
| Đọc danh sách | `/api/v2/voucher/get_voucher_list` | ERP, Seller In House, Marketing, Customer Service, Customized APP, Swam ERP | `marketplace_client` |
| Đọc chi tiết | `/api/v2/voucher/get_voucher` | ERP, Seller In House, Marketing, Customized APP, Swam ERP | `marketplace_client` |
| Tạo/update | `/api/v2/voucher/add_voucher`, `/api/v2/voucher/update_voucher` | ERP, Seller In House, Marketing, Swam ERP | `marketplace_client` |
| End/delete | `/api/v2/voucher/end_voucher`, `/api/v2/voucher/delete_voucher` | ERP, Seller In House, Marketing, Swam ERP | `marketplace_client` |

Kết luận: app `ADS GIADUNGHUYVAN` loại `Ads Service` không được mặc định xem là đủ quyền Voucher. Nếu diagnostics Voucher fail permission, cần app Marketplace/Marketing hoặc Shopee cấp thêm quyền và seller authorize lại.

## Bundle Deal

| Nghiệp vụ | Endpoint | Quyền/app cần | Client |
| --- | --- | --- | --- |
| Đọc danh sách/chi tiết/item | `/api/v2/bundle_deal/get_bundle_deal_list`, `/api/v2/bundle_deal/get_bundle_deal`, `/api/v2/bundle_deal/get_bundle_deal_item` | ERP, Seller In House, Marketing, Customized APP, Swam ERP | `marketplace_client` |
| Tạo/update | `/api/v2/bundle_deal/add_bundle_deal`, `/api/v2/bundle_deal/update_bundle_deal` | ERP, Seller In House, Marketing, Swam ERP | `marketplace_client` |
| End/delete | `/api/v2/bundle_deal/end_bundle_deal`, `/api/v2/bundle_deal/delete_bundle_deal` | ERP, Seller In House, Marketing, Swam ERP | `marketplace_client` |
| Thêm/update/xóa item | `/api/v2/bundle_deal/add_bundle_deal_item`, `/api/v2/bundle_deal/update_bundle_deal_item`, `/api/v2/bundle_deal/delete_bundle_deal_item` | ERP, Seller In House, Marketing, Swam ERP | `marketplace_client` |

Kết luận: cần payload riêng cho main/sub/item/model theo endpoint. Chưa được ghi “thao tác thật” nếu chưa verify bằng refetch.

## Add-On Deal

| Nghiệp vụ | Endpoint | Quyền/app cần | Client |
| --- | --- | --- | --- |
| Đọc danh sách/chi tiết/main/sub | `/api/v2/add_on_deal/get_add_on_deal_list`, `/api/v2/add_on_deal/get_add_on_deal`, `/api/v2/add_on_deal/get_add_on_deal_main_item`, `/api/v2/add_on_deal/get_add_on_deal_sub_item` | ERP, Seller In House, Marketing, Customized APP, Swam ERP | `marketplace_client` |
| Tạo/update | `/api/v2/add_on_deal/add_add_on_deal`, `/api/v2/add_on_deal/update_add_on_deal` | ERP, Seller In House, Marketing, Swam ERP | `marketplace_client` |
| End/delete | `/api/v2/add_on_deal/end_add_on_deal`, `/api/v2/add_on_deal/delete_add_on_deal` | ERP, Seller In House, Marketing, Swam ERP | `marketplace_client` |
| Main/sub item write | `/api/v2/add_on_deal/add_add_on_deal_main_item`, `/api/v2/add_on_deal/add_add_on_deal_sub_item`, update/delete main/sub item | ERP, Seller In House, Marketing, Swam ERP | `marketplace_client` |

Kết luận: nếu thiếu main/sub item hoặc model dữ liệu, queue phải `needs_data`; không gửi thật.

## Shop Flash Sale

| Nghiệp vụ | Endpoint | Quyền/app cần | Client |
| --- | --- | --- | --- |
| Đọc danh sách/chi tiết/item | `/api/v2/shop_flash_sale/get_shop_flash_sale_list`, `/api/v2/shop_flash_sale/get_shop_flash_sale`, `/api/v2/shop_flash_sale/get_shop_flash_sale_items` | ERP, Seller In House, Marketing, Swam ERP | `marketplace_client` |
| Lấy timeslot/criteria | `/api/v2/shop_flash_sale/get_time_slot_id`, `/api/v2/shop_flash_sale/get_item_criteria` | ERP, Seller In House, Marketing, Swam ERP | `marketplace_client` |
| Tạo/update/delete | `/api/v2/shop_flash_sale/create_shop_flash_sale`, `/api/v2/shop_flash_sale/update_shop_flash_sale`, `/api/v2/shop_flash_sale/delete_shop_flash_sale` | ERP, Seller In House, Marketing, Swam ERP | `marketplace_client` |
| Item write | `/api/v2/shop_flash_sale/add_shop_flash_sale_items`, `/api/v2/shop_flash_sale/update_shop_flash_sale_items`, `/api/v2/shop_flash_sale/delete_shop_flash_sale_items` | ERP, Seller In House, Marketing, Swam ERP | `marketplace_client` |

Kết luận: reference có endpoint Shop Flash Sale, nhưng app hiện tại vẫn phải diagnostics live. Nếu Shopee trả thiếu quyền hoặc app không được cấp Marketing/Seller thì UI phải khóa và nói rõ thiếu quyền/endpoint cho app hiện tại.

## Ads

| Nghiệp vụ | Endpoint | Quyền/app cần | Client |
| --- | --- | --- | --- |
| Balance/toggle | `/api/v2/ads/get_total_balance`, `/api/v2/ads/get_shop_toggle_info` | Ads Service, Ads Service App, Seller In House hoặc Marketing tùy endpoint | `ads_client` |
| Reporting | `/api/v2/ads/get_all_cpc_ads_daily_performance`, `/api/v2/ads/get_all_cpc_ads_hourly_performance`, campaign performance endpoints | Ads Service/Marketing scope tùy endpoint | `ads_client` |
| Campaign/keyword write | `/api/v2/ads/create_manual_product_ads`, `/api/v2/ads/edit_manual_product_ads`, `/api/v2/ads/edit_manual_product_ad_keywords` | Ads Service/Ads Service App/Seller In House/Ads Facil tùy endpoint | `ads_client` |
| Recommended item/keyword | `/api/v2/ads/get_recommended_item_list`, `/api/v2/ads/get_recommended_keyword_list` | Ads Service/Marketing scope tùy endpoint | `ads_client` |

Kết luận: key Ads hiện được tách vào `SHOPEE_ADS_*`. Phần Ads dùng key Ads. Phần Discount/Voucher/Bundle/Add-On/Flash Sale dùng key Marketplace/Marketing, không dùng key Ads Service.

## Order / Sales / ROAS / Sensitive Data

- Nếu ROAS lấy trực tiếp từ Shopee Ads reporting thì UI có thể ghi nguồn là Shopee Ads API live.
- Nếu ROAS tự tính từ order/payment/cache/import thì UI phải ghi nguồn rõ, không được gọi là Ads live.
- App detail đang hiển thị `Access to Sensitive Data: No access`, vì vậy buyer data, order detail nhạy cảm, finance/payment và báo cáo thuế có thể thiếu quyền. Không được fallback cost setting để báo cáo phí sàn/thuế như số chuẩn.
- Nếu cần doanh thu/finance chuẩn, phải dùng app có Order/Finance/Sensitive Data phù hợp, seller authorize lại và lưu snapshot D1 theo ngày.

## Câu trả lời bắt buộc cho hướng vận hành

- Key ADS hiện có: chỉ hợp lệ cho `ads_client`; sau refactor backend đã đọc `SHOPEE_ADS_*` trước, fallback DB cũ bị diagnostics cảnh báo.
- Phần ADS phải dùng `SHOPEE_ADS_PARTNER_ID/KEY/TOKEN`.
- Discount/Voucher/Bundle/Add-On/Flash Sale phải dùng `SHOPEE_MARKETPLACE_*` hoặc app row tương đương đã authorize Marketing/Seller scope.
- Có khả năng cần tạo thêm app Marketplace/Seller/Marketing khác nếu app hiện tại chỉ là Ads Service.
- Có khả năng cần seller authorize lại sau khi thêm app/quyền mới.
- Cần refresh token để tự làm mới access token; nếu thiếu refresh token thì diagnostics/action sẽ trả auth error và không retry bừa.
- Live/sandbox phải khóa bằng `SHOPEE_ENV`; hiện mặc định live nhưng write thật vẫn bị `SHOPEE_LIVE_WRITE_ENABLED=false` chặn.
- Endpoint nào diagnostics trả `permission_error` hoặc `unsupported_api` thì phải khóa UI theo endpoint đó, không tạo UI giả.
