# Bản đồ refactor route Worker

Ngày cập nhật: 2026-05-14.

Mục tiêu: gom route theo tính năng nhưng giữ nguyên public API và đường import cũ bằng wrapper mỏng ở `apps/worker-api/src/routes/*.js`.

## File đã chuyển

| File cũ | File mới | Lý do di chuyển | Public route |
| --- | --- | --- | --- |
| `apps/worker-api/src/routes/admin-auth.js` | `apps/worker-api/src/routes/operations/admin-auth.js` | Auth/admin là luồng vận hành nội bộ. | không đổi |
| `apps/worker-api/src/routes/ads.js` | `apps/worker-api/src/routes/ads/index.js` | Route ADS nằm cùng các module `ads/*`. | không đổi |
| `apps/worker-api/src/routes/api-features.js` | `apps/worker-api/src/routes/api-sync/features.js` | API features/actions thuộc cụm API sync/capability. | không đổi |
| `apps/worker-api/src/routes/bot-settings.js` | `apps/worker-api/src/routes/operations/bot-settings.js` | Cấu hình bot là route vận hành. | không đổi |
| `apps/worker-api/src/routes/customer-risk.js` | `apps/worker-api/src/routes/operations/customer-risk.js` | Cảnh báo rủi ro khách là tính năng vận hành. | không đổi |
| `apps/worker-api/src/routes/dashboard.js` | `apps/worker-api/src/routes/dashboard/index.js` | Dashboard đọc số liệu tổng hợp, đặt cùng feature dashboard. | không đổi |
| `apps/worker-api/src/routes/dashboard-aux.js` | `apps/worker-api/src/routes/dashboard/dashboard-aux.js` | Chỉ số phụ của dashboard, tránh tên `aux.js` vì Windows reserved name. | không đổi |
| `apps/worker-api/src/routes/income.js` | `apps/worker-api/src/routes/reports/income.js` | Báo cáo thu nhập thuộc cụm reports. | không đổi |
| `apps/worker-api/src/routes/invoices.js` | `apps/worker-api/src/routes/purchase/invoices.js` | Hóa đơn nhập hàng thuộc cụm purchase. | không đổi |
| `apps/worker-api/src/routes/jobs.js` | `apps/worker-api/src/routes/operations/jobs.js` | Job queue là route vận hành. | không đổi |
| `apps/worker-api/src/routes/labels.js` | `apps/worker-api/src/routes/labels/index.js` | Tem vận chuyển có feature folder riêng. | không đổi |
| `apps/worker-api/src/routes/logistics-watch.js` | `apps/worker-api/src/routes/operations/logistics-watch.js` | Theo dõi vận chuyển là route vận hành. | không đổi |
| `apps/worker-api/src/routes/marketplace-webhooks.js` | `apps/worker-api/src/routes/marketplace/index.js` | Webhook/push marketplace dùng cho nhiều nhóm, tách khỏi root route. | không đổi |
| `apps/worker-api/src/routes/operations.js` | `apps/worker-api/src/routes/operations/index.js` | Route operations chính nằm cùng các module vận hành. | không đổi |
| `apps/worker-api/src/routes/order-analytics.js` | `apps/worker-api/src/routes/order-analytics/index.js` | Giữ chung với core rebuild `order-analytics/*`. | không đổi |
| `apps/worker-api/src/routes/purchase.js` | `apps/worker-api/src/routes/purchase/index.js` | Route mua hàng nằm trong feature purchase. | không đổi |
| `apps/worker-api/src/routes/reports.js` | `apps/worker-api/src/routes/reports/index.js` | Upload/report chung nằm trong feature reports. | không đổi |
| `apps/worker-api/src/routes/returns.js` | `apps/worker-api/src/routes/returns/index.js` | Returns đã có module `returns/complaints.js`. | không đổi |
| `apps/worker-api/src/routes/reviews.js` | `apps/worker-api/src/routes/reviews/index.js` | Review marketplace là feature riêng. | không đổi |
| `apps/worker-api/src/routes/shops.js` | `apps/worker-api/src/routes/shops/index.js` | Shop/API config là feature riêng. | không đổi |
| `apps/worker-api/src/routes/top-picks.js` | `apps/worker-api/src/routes/top-picks/index.js` | Top Picks là feature riêng. | không đổi |
| `apps/worker-api/src/routes/worker-chat-marketplace-route.js` | `apps/worker-api/src/routes/marketplace-chat/index.js` | Wrapper chat marketplace được đặt vào feature folder, module nghiệp vụ cũ vẫn ở `worker-chat-marketplace/*`. | không đổi |

## Tách thêm trong cùng lượt

| File nguồn | File mới | Lý do |
| --- | --- | --- |
| `apps/worker-api/src/routes/shops/index.js` | `apps/worker-api/src/routes/shops/shopee-video-token.js` | Giảm file shop route xuống dưới 30KB, tách riêng refresh token Shopee Video. |
| mới | `apps/worker-api/src/routes/api-sync/shopee/orders/backfill-missing-items.js` | Endpoint repair order_items thiếu dùng lại Shopee `get_order_detail` và import payload cũ. |

## File giữ nguyên vì là entrypoint hoặc aggregator

| File | Lý do giữ ngoài folder |
| --- | --- |
| `apps/worker-api/src/routes/api-sync.js` | Aggregator cài core API sync Shopee/Lazada/ADS/finance; check bắt buộc đang gọi trực tiếp file này. |
| `apps/worker-api/src/routes/api-modules.js` | Wrapper rất mỏng cho API modules, giữ đường import cũ. |
| `apps/worker-api/src/routes/discounts.js` | Aggregator promotion/discount, logic đã tách dưới `routes/discounts/*`. |
| `apps/worker-api/src/routes/orders.js` | Wrapper rất mỏng cho `routes/orders/*`, giữ đường import cũ. |
| `apps/worker-api/src/routes/products.js` | Wrapper rất mỏng cho `routes/products/*`, giữ đường import cũ. |
| `apps/worker-api/src/routes/video.js` | Wrapper rất mỏng cho `routes/video/*`, giữ đường import cũ. |
| Các wrapper mới ở `apps/worker-api/src/routes/*.js` | Chỉ export lại file mới để không làm gãy import hiện có và public route production. |

## Needs Review

Hiện chưa có file root nào còn chứa logic nghiệp vụ lớn ngoài các wrapper/aggregator đã liệt kê. Nếu mở rộng tiếp, ưu tiên tách sâu theo feature thay vì thêm logic vào wrapper root.

## TODO Phase 2

- `apps/worker-api/src/routes/api-sync/shopee/returns/actions.js`: sát 30KB, cần tách nhóm action/dispute/upload proof nếu sửa tiếp.
- `apps/worker-api/src/routes/api-sync/ads/shopee/campaign-actions.js`: sát 30KB, cần tách create/edit auto/manual campaign nếu sửa tiếp.
- `apps/worker-api/src/routes/marketplace/index.js`: sát 30KB, cần tách webhook verify, event status và sync queue nếu sửa tiếp.
- `apps/worker-api/src/routes/products/cost-variations-handler.js`: trên 28KB, cần tách cost settings và variation quick-map nếu sửa tiếp.
- `apps/worker-api/src/routes/labels/index.js`: trên 28KB, cần tách label status/read/refresh nếu sửa tiếp.
- Ngoài route Worker, guard cũng cảnh báo các file sát 30KB cần xử lý ở phase khác nếu chạm tiếp: `apps/fe/js/modules/oms-api-advanced.js`, `apps/fe/js/admin/purchase-manager.js`, `apps/fe/js/oms-main.js`, `apps/fe/js/modules/oms-render.js`, `apps/worker-api/src/index.js`, `apps/worker-api/src/core/product-catalog-core.js`.
